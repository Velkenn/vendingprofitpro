import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Pricing table (per 1M tokens) ---
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-flash-lite": { input: 0.075, output: 0.30 },
  "google/gemini-2.5-flash": { input: 0.15, output: 0.60 },
  "google/gemini-3-flash-preview": { input: 0.15, output: 0.60 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10.00 },
};
const DEFAULT_PRICING = { input: 0.50, output: 1.50 };

async function logUsage(supabase: any, userId: string, featureType: string, model: string, inputChars: number, outputChars: number) {
  try {
    const inputTokens = Math.ceil(inputChars / 4);
    const outputTokens = Math.ceil(outputChars / 4);
    const pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
    const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
    await supabase.from("api_usage_logs").insert({
      user_id: userId,
      feature_type: featureType,
      model_used: model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: cost,
    });
  } catch (e) {
    console.error("Failed to log usage:", e);
  }
}

interface AIConfig {
  provider: "anthropic" | "openai" | "google" | "lovable";
  apiKey: string;
  model: string;
}

interface Intent {
  needs_skus: boolean;
  needs_receipts: boolean;
  needs_items: boolean;
  needs_machines: boolean;
  needs_sales: boolean;
  date_filter: string | null;
}

async function fetchAllRows(_table: string, query: any) {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return allRows;
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
    return { provider: "lovable", apiKey: lovableKey, model: "google/gemini-2.5-flash-lite" };
  }

  throw new Error("No AI provider configured. Please set one up in Settings → AI Settings.");
}

// --- Regex-based intent shortcutting ---
const MONTH_NAMES: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
  jan: "01", feb: "02", mar: "03", apr: "04",
  jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function detectIntent(question: string): Intent {
  const q = question.toLowerCase();

  // Extract date filter if present
  let date_filter: string | null = null;
  const monthYearMatch = q.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})\b/);
  if (monthYearMatch) {
    date_filter = `${monthYearMatch[2]}-${MONTH_NAMES[monthYearMatch[1]]}`;
  }
  const isoMatch = q.match(/\b(\d{4})-(\d{2})\b/);
  if (!date_filter && isoMatch) {
    date_filter = `${isoMatch[1]}-${isoMatch[2]}`;
  }

  const defaultAll: Intent = { needs_skus: true, needs_receipts: true, needs_items: true, needs_machines: true, needs_sales: true, date_filter };

  // Broad/overview questions
  if (/\b(overview|summary|how.?s my business|full analysis|everything|dashboard|report)\b/.test(q)) {
    return defaultAll;
  }

  // Machine/revenue questions
  if (/\b(machine|revenue|vending|cash|credit|collection)\b/.test(q) && !/\b(sku|product|item|bought|purchase|receipt|cost|store)\b/.test(q)) {
    return { needs_skus: false, needs_receipts: false, needs_items: false, needs_machines: true, needs_sales: true, date_filter };
  }

  // SKU/product/profit questions
  if (/\b(sku|product|profit|margin|sell price|best seller|worst seller|rebuy)\b/.test(q) && !/\b(machine|revenue|collection)\b/.test(q)) {
    return { needs_skus: true, needs_receipts: true, needs_items: true, needs_machines: false, needs_sales: false, date_filter };
  }

  // Purchase/receipt/store questions
  if (/\b(receipt|purchase|bought|spend|spent|store|vendor|sam|walmart|costco)\b/.test(q) && !/\b(machine|revenue)\b/.test(q)) {
    return { needs_skus: true, needs_receipts: true, needs_items: true, needs_machines: false, needs_sales: false, date_filter };
  }

  // Restock/inventory questions
  if (/\b(restock|inventory|run out|running low|what.*(do|need).*this week|needs? attention|supply|stock up)\b/.test(q)) {
    return { needs_skus: true, needs_receipts: true, needs_items: true, needs_machines: false, needs_sales: false, date_filter };
  }

  // Default: fetch everything
  return defaultAll;
}

function getDateCutoffs() {
  const now = new Date();
  const receipts90 = new Date(now);
  receipts90.setDate(receipts90.getDate() - 90);
  const sales6mo = new Date(now);
  sales6mo.setMonth(sales6mo.getMonth() - 6);
  return {
    receiptCutoff: receipts90.toISOString().split("T")[0],
    salesCutoff: sales6mo.toISOString().split("T")[0],
  };
}

async function fetchSelectiveContext(supabase: any, userId: string, intent: Intent) {
  const fetches: Promise<any>[] = [];
  const keys: string[] = [];
  const { receiptCutoff, salesCutoff } = getDateCutoffs();

  // Always fetch memories
  fetches.push(fetchAllRows("chip_memories", supabase.from("chip_memories").select("memory_text, created_at").eq("user_id", userId).order("created_at", { ascending: false })));
  keys.push("memories");

  if (intent.needs_skus) {
    fetches.push(fetchAllRows("skus", supabase.from("skus").select("id, sku_name, sell_price, category, rebuy_status, default_is_personal").eq("user_id", userId)));
    keys.push("skus");
  }

  if (intent.needs_receipts) {
    let q = supabase.from("receipts").select("id, vendor, receipt_date, store_location, total, tax, subtotal, item_count").eq("user_id", userId).order("receipt_date", { ascending: false });
    if (intent.date_filter) {
      const [year, month] = intent.date_filter.split("-").map(Number);
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = month === 12 ? 1 : month + 1;
      const endYear = month === 12 ? year + 1 : year;
      const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
      q = q.gte("receipt_date", start).lt("receipt_date", end);
    } else {
      q = q.gte("receipt_date", receiptCutoff);
    }
    fetches.push(fetchAllRows("receipts", q));
    keys.push("receipts");
  }

  if (intent.needs_machines) {
    fetches.push(fetchAllRows("machines", supabase.from("machines").select("id, name, location").eq("user_id", userId)));
    keys.push("machines");
  }

  if (intent.needs_sales) {
    let q = supabase.from("machine_sales").select("machine_id, date, cash_amount, credit_amount").eq("user_id", userId).order("date", { ascending: false });
    if (intent.date_filter) {
      const [year, month] = intent.date_filter.split("-").map(Number);
      const start = `${year}-${String(month).padStart(2, "0")}-01`;
      const endMonth = month === 12 ? 1 : month + 1;
      const endYear = month === 12 ? year + 1 : year;
      const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
      q = q.gte("date", start).lt("date", end);
    } else {
      q = q.gte("date", salesCutoff);
    }
    fetches.push(fetchAllRows("machine_sales", q));
    keys.push("sales");
  }

  const results = await Promise.all(fetches);
  const ctx: any = { skus: [], receipts: [], items: [], machines: [], sales: [], memories: [] };
  for (let i = 0; i < keys.length; i++) {
    ctx[keys[i]] = results[i];
  }

  // Filter out Failed and Do Not Rebuy SKUs
  if (ctx.skus.length > 0) {
    ctx.skus = ctx.skus.filter((s: any) => s.rebuy_status !== "Failed" && s.rebuy_status !== "Do Not Rebuy");
  }

  // Fetch items separately — filter by receipt IDs we already fetched (time-bounded)
  if (intent.needs_items) {
    if (ctx.receipts.length > 0) {
      const receiptIds = ctx.receipts.map((r: any) => r.id);
      // Fetch items in batches of receipt IDs to avoid URL length limits
      const batchSize = 100;
      const allItems: any[] = [];
      for (let i = 0; i < receiptIds.length; i += batchSize) {
        const batch = receiptIds.slice(i, i + batchSize);
        const items = await fetchAllRows("receipt_items",
          supabase.from("receipt_items")
            .select("receipt_id, raw_name, qty, pack_size, line_total, unit_cost, is_personal, sku_id")
            .eq("user_id", userId)
            .in("receipt_id", batch)
        );
        allItems.push(...items);
      }
      ctx.items = allItems;
    } else {
      ctx.items = [];
    }
  }

  return ctx;
}

function buildSystemPrompt(ctx: any): string {
  const sections: string[] = [];

  sections.push(`You are Chip, a friendly and knowledgeable AI assistant for VendingTrackr — a vending machine business management app. You have deep expertise in the vending industry including typical profit margins (30-50%), restocking patterns, seasonal trends, and what good vs bad performance looks like.

Data shown is from the last 90 days for purchases and 6 months for machine revenue. If the user asks about older data, let them know you only have recent data available.`);

  // SKUs
  if (ctx.skus.length > 0) {
    const skuSummary = ctx.skus.map((s: any) =>
      `- ${s.sku_name} | sell: $${s.sell_price ?? "?"} | status: ${s.rebuy_status} | cat: ${s.category ?? "?"} | personal: ${s.default_is_personal}`
    ).join("\n");
    sections.push(`## SKUs (${ctx.skus.length} active products)\n${skuSummary}\n\nNote: SKUs marked as Failed or Do Not Rebuy have been excluded. Do not recommend or analyze them — the user has already moved on from those products.`);
  }

  // Items + SKU profit analysis
  if (ctx.items.length > 0 && ctx.skus.length > 0) {
    const receiptDateMap: Record<string, string> = {};
    for (const r of ctx.receipts) receiptDateMap[r.id] = r.receipt_date;

    const activeSkuIds = new Set(ctx.skus.map((s: any) => s.id));
    const skuCosts: Record<string, { totalCost: number; totalUnits: number; name: string }> = {};
    for (const item of ctx.items) {
      if (item.is_personal || !item.sku_id || !activeSkuIds.has(item.sku_id)) continue;
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

    if (skuProfitLines) sections.push(`## SKU Profit Analysis\n${skuProfitLines}`);

    const purchaseDetail = ctx.items.map((item: any) => {
      const date = receiptDateMap[item.receipt_id] ?? "?";
      const units = (item.qty || 1) * (item.pack_size || 1);
      return `- ${date} | ${item.raw_name} | qty: ${item.qty}, pack: ${item.pack_size ?? 1}, units: ${units}, cost: $${item.line_total}, personal: ${item.is_personal}`;
    }).join("\n");
    sections.push(`## Purchase Detail (${ctx.items.length} line items)\n${purchaseDetail}`);
  }

  // Receipts
  if (ctx.receipts.length > 0) {
    const receiptLines = ctx.receipts.map((r: any) =>
      `- ${r.receipt_date} | ${r.vendor} | ${r.store_location ?? "?"} | total: $${r.total ?? "?"} | items: ${r.item_count ?? "?"}`
    ).join("\n");
    sections.push(`## Receipts (${ctx.receipts.length} total)\n${receiptLines}`);
  }

  // Machines & Sales
  if (ctx.machines.length > 0) {
    const machineSummary = ctx.machines.map((m: any) => {
      const mSales = ctx.sales.filter((s: any) => s.machine_id === m.id);
      const totalRev = mSales.reduce((sum: number, s: any) => sum + Number(s.cash_amount) + Number(s.credit_amount), 0);
      const salesLines = mSales.map((s: any) => {
        const cash = Number(s.cash_amount);
        const credit = Number(s.credit_amount);
        return `  - ${s.date}: cash $${cash.toFixed(2)}, credit $${credit.toFixed(2)}, total $${(cash + credit).toFixed(2)}`;
      }).join("\n");
      return `- ${m.name} (${m.location ?? "?"}):\n${salesLines || "  No sales logged."}\n  Summary: ${mSales.length} entries, total revenue $${totalRev.toFixed(2)}`;
    }).join("\n");
    sections.push(`## Machines & Revenue\n${machineSummary}`);
  }

  const memorySummary = ctx.memories.length > 0
    ? ctx.memories.map((m: any) => `- ${m.memory_text}`).join("\n")
    : "No saved memories yet.";
  sections.push(`## Chip's Saved Memories\n${memorySummary}`);

  sections.push(`## Response Format (STRICT — follow exactly)
1. Lead with ONE bold sentence: the single most important insight or answer.
2. Follow with up to 3 short bullet points. Each MUST contain a specific number or dollar figure.
3. NO section headers. NO nested lists. NO tables unless explicitly asked.
4. End with one short actionable recommendation starting with "→".
5. Keep total response under 100 words. It must fit on one phone screen.
6. When answering about profit: profit = (sell_price × units) - cost.
7. Proactively compare time periods when relevant (e.g. "up 12% from last month").
8. Reference saved memories when relevant.
9. If you lack data, say so in one sentence.
10. Today's date is ${new Date().toISOString().split("T")[0]}.`);

  return sections.join("\n\n");
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
  if (!res.ok) {
    if (res.status === 429) throw new Error("RATE_LIMIT");
    throw new Error(`Google error: ${res.status}`);
  }
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

    // Step 1: Detect intent via regex (no AI call) + get AI config
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    const intent = detectIntent(lastUserMsg);

    console.log("Intent detection (regex):", JSON.stringify(intent));

    const aiConfig = await getAIConfig(supabase, user.id);

    // Step 2: Fetch only the data Chip needs (time-bounded)
    const ctx = await fetchSelectiveContext(supabase, user.id, intent);

    const systemPrompt = buildSystemPrompt(ctx);

    // Step 3: Trim conversation history to last 6 messages (3 exchanges)
    const trimmedMessages = messages.length > 6 ? messages.slice(-6) : messages;
    const fullMessages = [{ role: "system", content: systemPrompt }, ...trimmedMessages];

    // Calculate input chars for usage logging
    const inputChars = fullMessages.reduce((sum: number, m: any) => sum + (m.content?.length || 0), 0);

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

    // Helper to wrap a stream and log usage when done
    const wrapStreamWithLogging = (originalStream: ReadableStream<Uint8Array>, transformFn?: (line: string, controller: ReadableStreamDefaultController) => string | null) => {
      const reader = originalStream.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let outputChars = 0;

      return new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
            logUsage(supabase, user!.id, "chip_chat", aiConfig.model, inputChars, outputChars);
            return;
          }
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;
            try {
              if (transformFn) {
                const content = transformFn(jsonStr, controller);
                if (content) outputChars += content.length;
              } else {
                const evt = JSON.parse(jsonStr);
                const content = evt.choices?.[0]?.delta?.content;
                if (content) outputChars += content.length;
                controller.enqueue(encoder.encode(`data: ${jsonStr}\n\n`));
              }
            } catch {}
          }
        },
      });
    };

    if (aiConfig.provider === "anthropic") {
      const stream = wrapStreamWithLogging(streamRes.body!, (jsonStr, controller) => {
        const evt = JSON.parse(jsonStr);
        if (evt.type === "content_block_delta" && evt.delta?.text) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: evt.delta.text } }] })}\n\n`));
          return evt.delta.text;
        }
        return null;
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    if (aiConfig.provider === "google") {
      const stream = wrapStreamWithLogging(streamRes.body!, (jsonStr, controller) => {
        const evt = JSON.parse(jsonStr);
        const content = evt.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`));
          return content;
        }
        return null;
      });
      return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
    }

    // Lovable/OpenAI — pass through but track output
    const stream = wrapStreamWithLogging(streamRes.body!);
    return new Response(stream, {
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
