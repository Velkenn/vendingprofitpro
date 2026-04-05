import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface AIConfig {
  provider: "anthropic" | "openai" | "google" | "lovable";
  apiKey: string;
  model: string;
}

async function getAIConfig(supabase: any, userId: string): Promise<AIConfig> {
  const { data } = await supabase
    .from("ai_provider_settings")
    .select("provider, encrypted_api_key, model, is_default")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data) {
    const encKey = Deno.env.get("AI_ENCRYPTION_KEY")!;
    const { data: decrypted } = await supabase.rpc("decrypt_ai_key", {
      encrypted_text: data.encrypted_api_key,
      enc_key: encKey,
    });
    return { provider: data.provider, apiKey: decrypted, model: data.model };
  }

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    return { provider: "lovable", apiKey: lovableKey, model: "google/gemini-3-flash-preview" };
  }

  throw new Error("No AI provider configured. Please set one up in Settings → AI Settings.");
}

async function fetchUserContext(supabase: any, userId: string) {
  const [skusRes, receiptsRes, itemsRes, machinesRes, salesRes, memoriesRes] = await Promise.all([
    supabase.from("skus").select("id, sku_name, sell_price, category, rebuy_status, default_is_personal").eq("user_id", userId),
    supabase.from("receipts").select("id, vendor, receipt_date, store_location, total, tax, subtotal, item_count").eq("user_id", userId).order("receipt_date", { ascending: false }),
    supabase.from("receipt_items").select("receipt_id, raw_name, qty, pack_size, line_total, unit_cost, is_personal, sku_id").eq("user_id", userId),
    supabase.from("machines").select("id, name, location").eq("user_id", userId),
    supabase.from("machine_sales").select("machine_id, date, cash_amount, credit_amount").eq("user_id", userId).order("date", { ascending: false }),
    supabase.from("chip_memories").select("memory_text, created_at").eq("user_id", userId).order("created_at", { ascending: false }),
  ]);

  return {
    skus: skusRes.data || [],
    receipts: receiptsRes.data || [],
    items: itemsRes.data || [],
    machines: machinesRes.data || [],
    sales: salesRes.data || [],
    memories: memoriesRes.data || [],
  };
}

function buildSystemPrompt(ctx: any): string {
  const skuSummary = ctx.skus.map((s: any) =>
    `- ${s.sku_name} | sell: $${s.sell_price ?? "?"} | status: ${s.rebuy_status} | cat: ${s.category ?? "?"} | personal: ${s.default_is_personal}`
  ).join("\n");

  const receiptSummary = ctx.receipts.slice(0, 200).map((r: any) =>
    `- ${r.receipt_date} | ${r.vendor} | ${r.store_location ?? "?"} | total: $${r.total ?? "?"} | items: ${r.item_count ?? "?"}`
  ).join("\n");

  // Build SKU cost data from receipt items
  const skuCosts: Record<string, { totalCost: number; totalUnits: number; name: string }> = {};
  for (const item of ctx.items) {
    if (item.is_personal || !item.sku_id) continue;
    if (!skuCosts[item.sku_id]) {
      const sku = ctx.skus.find((s: any) => s.id === item.sku_id);
      skuCosts[item.sku_id] = { totalCost: 0, totalUnits: 0, name: sku?.sku_name ?? item.raw_name };
    }
    skuCosts[item.sku_id].totalCost += Number(item.line_total) || 0;
    skuCosts[item.sku_id].totalUnits += (item.qty || 1) * (item.pack_size || 1);
  }

  const skuProfitLines = Object.entries(skuCosts).map(([skuId, data]) => {
    const sku = ctx.skus.find((s: any) => s.id === skuId);
    const sellPrice = sku?.sell_price ? Number(sku.sell_price) : null;
    const avgCostPerUnit = data.totalUnits > 0 ? data.totalCost / data.totalUnits : null;
    const profitPerUnit = sellPrice && avgCostPerUnit ? (sellPrice - avgCostPerUnit).toFixed(2) : "?";
    return `- ${data.name}: ${data.totalUnits} units bought, avg cost/unit $${avgCostPerUnit?.toFixed(2) ?? "?"}, sell $${sellPrice ?? "?"}, profit/unit $${profitPerUnit}`;
  }).join("\n");

  const machineSummary = ctx.machines.map((m: any) => {
    const mSales = ctx.sales.filter((s: any) => s.machine_id === m.id);
    const totalRev = mSales.reduce((sum: number, s: any) => sum + Number(s.cash_amount) + Number(s.credit_amount), 0);
    return `- ${m.name} (${m.location ?? "?"}): ${mSales.length} sales logged, total revenue $${totalRev.toFixed(2)}`;
  }).join("\n");

  const memorySummary = ctx.memories.length > 0
    ? ctx.memories.map((m: any) => `- ${m.memory_text}`).join("\n")
    : "No saved memories yet.";

  return `You are Chip, a friendly and knowledgeable AI assistant for VendingTrackr — a vending machine business management app. You have deep expertise in the vending industry including typical profit margins (30-50%), restocking patterns, seasonal trends, and what good vs bad performance looks like.

You have access to ALL of this user's business data:

## SKUs (${ctx.skus.length} total)
${skuSummary || "No SKUs yet."}

## SKU Profit Analysis
${skuProfitLines || "No purchase data yet."}

## Receipts (${ctx.receipts.length} total, showing most recent 200)
${receiptSummary || "No receipts yet."}

## Machines & Revenue
${machineSummary || "No machines yet."}

## Chip's Saved Memories (user-saved insights from past conversations)
${memorySummary}

## Guidelines
- Be concise but thorough. Use numbers and data points.
- When answering about profit, always clarify: profit = (sell_price × units) - cost.
- Proactively compare time periods when relevant (e.g. "That's up 12% from last month").
- Reference saved memories when they're relevant to the question.
- If you don't have enough data to answer, say so clearly.
- Use markdown formatting for readability (bold, lists, tables when helpful).
- Be encouraging but honest about performance.
- Today's date is ${new Date().toISOString().split("T")[0]}.`;
}

async function streamWithLovable(apiKey: string, model: string, messages: any[]) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("PAYMENT_REQUIRED");
    throw new Error(`AI gateway error: ${res.status}`);
  }
  return res;
}

async function streamWithAnthropic(apiKey: string, model: string, messages: any[]) {
  const systemMsg = messages.find((m: any) => m.role === "system")?.content || "";
  const userMsgs = messages.filter((m: any) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 4096, system: systemMsg, messages: userMsgs, stream: true }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status}`);
  return res;
}

async function streamWithOpenAI(apiKey: string, model: string, messages: any[]) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);
  return res;
}

async function streamWithGoogle(apiKey: string, model: string, messages: any[]) {
  // Use Lovable gateway format for Google models too if using user's own key
  // Google's native streaming API is complex, so we convert to non-streaming
  const systemMsg = messages.find((m: any) => m.role === "system")?.content || "";
  const userMsgs = messages.filter((m: any) => m.role !== "system").map((m: any) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemMsg }] },
      contents: userMsgs,
      generationConfig: { maxOutputTokens: 4096 },
    }),
  });
  if (!res.ok) throw new Error(`Google error: ${res.status}`);
  return res;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();
    const aiConfig = await getAIConfig(supabase, user.id);
    const ctx = await fetchUserContext(supabase, user.id);
    const systemPrompt = buildSystemPrompt(ctx);

    const fullMessages = [{ role: "system", content: systemPrompt }, ...messages];

    let streamRes: Response;

    if (aiConfig.provider === "lovable") {
      streamRes = await streamWithLovable(aiConfig.apiKey, aiConfig.model, fullMessages);
    } else if (aiConfig.provider === "anthropic") {
      streamRes = await streamWithAnthropic(aiConfig.apiKey, aiConfig.model, fullMessages);
    } else if (aiConfig.provider === "openai") {
      streamRes = await streamWithOpenAI(aiConfig.apiKey, aiConfig.model, fullMessages);
    } else if (aiConfig.provider === "google") {
      streamRes = await streamWithGoogle(aiConfig.apiKey, aiConfig.model, fullMessages);
    } else {
      throw new Error("Unsupported provider");
    }

    // For Anthropic and Google, we need to transform the stream to OpenAI-compatible SSE
    if (aiConfig.provider === "anthropic") {
      const reader = streamRes.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); return; }
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const evt = JSON.parse(jsonStr);
              if (evt.type === "content_block_delta" && evt.delta?.text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: evt.delta.text } }] })}\n\n`));
              }
            } catch {}
          }
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    if (aiConfig.provider === "google") {
      const reader = streamRes.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) { controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); return; }
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;
            try {
              const evt = JSON.parse(jsonStr);
              const content = evt.candidates?.[0]?.content?.parts?.[0]?.text;
              if (content) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
              }
            } catch {}
          }
        },
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    // OpenAI and Lovable already return OpenAI-compatible SSE
    return new Response(streamRes.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chip-chat error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    if (msg === "RATE_LIMIT") {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (msg === "PAYMENT_REQUIRED") {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
