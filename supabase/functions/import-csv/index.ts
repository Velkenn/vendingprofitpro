import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
      user_id: userId, feature_type: featureType, model_used: model,
      input_tokens: inputTokens, output_tokens: outputTokens, estimated_cost_usd: cost,
    });
  } catch (e) { console.error("Failed to log usage:", e); }
}

const NORMALIZE_TOOL = {
  type: "function",
  function: {
    name: "normalize_names",
    description: "Return normalized product names for a batch of raw receipt item names",
    parameters: {
      type: "object",
      properties: {
        names: {
          type: "array",
          items: {
            type: "object",
            properties: {
              raw_name: { type: "string" },
              normalized_name: { type: "string" },
            },
            required: ["raw_name", "normalized_name"],
          },
        },
      },
      required: ["names"],
    },
  },
};

function buildNormalizeSystem(existingSkuNames: string[]): string {
  let base = `You normalize raw receipt product names into clean, short, consistent Title Case names.
Rules:
- Keep the brand name and key product identifier (flavor/variant) intact
- Strip pack sizes, weights, counts, UPCs, and redundant descriptors
- Use proper capitalization and punctuation
- IMPORTANT: If a raw name clearly refers to the same product as one of the user's existing SKU names below, return that EXACT existing name.
- Examples:
  "Monster Energy Zero Ultra 12pk" → "Monster Energy Zero Ultra"
  "GV 2% REDUCED FAT MILK GAL" → "Great Value 2% Milk"
Return a normalized_name for every raw_name provided.`;
  if (existingSkuNames.length > 0) {
    base += `\n\nUser's existing SKU names (reuse these when the raw name matches):\n${existingSkuNames.map(n => `- ${n}`).join("\n")}`;
  }
  return base;
}

function fuzzyMatchSku(name1: string, name2: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const n1 = normalize(name1);
  const n2 = normalize(name2);
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  const words1 = new Set(n1.split(" ").filter(w => w.length > 1));
  const words2 = new Set(n2.split(" ").filter(w => w.length > 1));
  if (words1.size === 0 || words2.size === 0) return false;
  let overlap = 0;
  for (const w of words1) { if (words2.has(w)) overlap++; }
  const smaller = Math.min(words1.size, words2.size);
  return smaller > 0 && (overlap / smaller) >= 0.8;
}

function parseToolCallResult(toolCall: any): any {
  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    let cleaned = toolCall.function.arguments || "";
    cleaned = cleaned.replace(/,\s*$/g, "").replace(/[\x00-\x1F\x7F]/g, "");
    let braces = 0, brackets = 0;
    for (const ch of cleaned) {
      if (ch === '{') braces++; if (ch === '}') braces--;
      if (ch === '[') brackets++; if (ch === ']') brackets--;
    }
    while (brackets > 0) { cleaned += "]"; brackets--; }
    while (braces > 0) { cleaned += "}"; braces--; }
    cleaned = cleaned.replace(/,\s*]/g, "]").replace(/,\s*}/g, "}");
    return JSON.parse(cleaned);
  }
}

async function normalizeNamesWithAI(
  rawNames: string[],
  provider: string,
  apiKey: string,
  model: string,
  existingSkuNames: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (rawNames.length === 0) return result;
  const systemPrompt = buildNormalizeSystem(existingSkuNames);
  const prompt = `Normalize these raw receipt product names:\n${rawNames.map((n, i) => `${i + 1}. "${n}"`).join("\n")}`;

  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: 4096, system: systemPrompt,
          tools: [{ name: "normalize_names", description: NORMALIZE_TOOL.function.description, input_schema: NORMALIZE_TOOL.function.parameters }],
          tool_choice: { type: "tool", name: "normalize_names" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) { console.error("Normalize AI error:", await res.text()); return result; }
      const data = await res.json();
      const toolUse = data.content?.find((c: any) => c.type === "tool_use");
      if (toolUse?.input?.names) {
        for (const n of toolUse.input.names) result.set(n.raw_name.toLowerCase(), n.normalized_name);
      }
    } else if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, max_tokens: 4096,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
          tools: [NORMALIZE_TOOL],
          tool_choice: { type: "function", function: { name: "normalize_names" } },
        }),
      });
      if (!res.ok) { console.error("Normalize AI error:", await res.text()); return result; }
      const data = await res.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        const parsed = parseToolCallResult(toolCall);
        if (parsed?.names) {
          for (const n of parsed.names) result.set(n.raw_name.toLowerCase(), n.normalized_name);
        }
      }
    } else if (provider === "google") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts: [{ text: prompt }] }],
            tools: [{ functionDeclarations: [{ name: "normalize_names", description: NORMALIZE_TOOL.function.description, parameters: NORMALIZE_TOOL.function.parameters }] }],
            toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["normalize_names"] } },
            generationConfig: { maxOutputTokens: 4096 },
          }),
        }
      );
      if (!res.ok) { console.error("Normalize AI error:", await res.text()); return result; }
      const data = await res.json();
      const fc = data.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall);
      if (fc?.functionCall?.args?.names) {
        for (const n of fc.functionCall.args.names) result.set(n.raw_name.toLowerCase(), n.normalized_name);
      }
    }
  } catch (e) { console.error("Name normalization failed:", e); }
  return result;
}

// Use Lovable AI Gateway as fallback
async function normalizeNamesWithGateway(
  rawNames: string[],
  existingSkuNames: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (rawNames.length === 0) return result;
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return result;

  const systemPrompt = buildNormalizeSystem(existingSkuNames);
  const prompt = `Normalize these raw receipt product names:\n${rawNames.map((n, i) => `${i + 1}. "${n}"`).join("\n")}`;
  const model = "google/gemini-2.5-flash-lite";

  try {
    const res = await fetch("https://aig.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 4096,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
        tools: [NORMALIZE_TOOL],
        tool_choice: { type: "function", function: { name: "normalize_names" } },
      }),
    });
    if (!res.ok) { console.error("Gateway normalize error:", await res.text()); return result; }
    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      const parsed = parseToolCallResult(toolCall);
      if (parsed?.names) {
        for (const n of parsed.names) result.set(n.raw_name.toLowerCase(), n.normalized_name);
      }
    }
  } catch (e) { console.error("Gateway normalization failed:", e); }
  return result;
}

async function getUserAIConfig(supabase: any, userId: string, encryptionKey: string) {
  const { data } = await supabase
    .from("ai_provider_settings")
    .select("provider, encrypted_api_key, model, is_default")
    .eq("user_id", userId).eq("is_default", true).single();

  if (!data) {
    const { data: any_provider } = await supabase
      .from("ai_provider_settings")
      .select("provider, encrypted_api_key, model")
      .eq("user_id", userId).limit(1).single();
    if (!any_provider) return null;
    const { data: decrypted } = await supabase.rpc("decrypt_ai_key", { encrypted_text: any_provider.encrypted_api_key, enc_key: encryptionKey });
    return { provider: any_provider.provider, apiKey: decrypted, model: any_provider.model };
  }

  const { data: decrypted } = await supabase.rpc("decrypt_ai_key", { encrypted_text: data.encrypted_api_key, enc_key: encryptionKey });
  return { provider: data.provider, apiKey: decrypted, model: data.model };
}

interface CsvRow {
  date: string;
  store: string;
  product_name: string;
  units: number;
  total_cost: number;
  sell_price: number | null;
}

function parseDate(raw: string): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();

  // ISO 8601: 2025-01-15
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  // M/D/YYYY or MM/DD/YYYY
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;

  // MM/DD/YY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m) return `20${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;

  // Month D, YYYY or Month D YYYY
  m = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const months: Record<string, string> = {
      january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
      july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
      jan: "01", feb: "02", mar: "03", apr: "04", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const mo = months[m[1].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[2].padStart(2, "0")}`;
  }

  return null;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else { current += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(current.trim()); current = ""; }
      else current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("AI_ENCRYPTION_KEY") || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader?.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const { rows } = await req.json() as { rows: any[] };
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const skipped: { row: number; reason: string }[] = [];
    const validRows: (CsvRow & { rowNum: number })[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNum = i + 2; // +2 for header row + 0-index

      if (!r.date || !r.date.trim()) { skipped.push({ row: rowNum, reason: "Missing date" }); continue; }
      if (!r.product_name || !r.product_name.trim()) { skipped.push({ row: rowNum, reason: "Missing product name" }); continue; }

      const totalCost = parseFloat(r.total_cost);
      if (isNaN(totalCost) || totalCost <= 0) { skipped.push({ row: rowNum, reason: "Invalid or missing total cost" }); continue; }

      const parsedDate = parseDate(r.date);
      if (!parsedDate) { skipped.push({ row: rowNum, reason: `Cannot parse date: "${r.date}"` }); continue; }

      const units = parseFloat(r.units) || 1;
      const sellPrice = r.sell_price ? parseFloat(r.sell_price) : null;

      validRows.push({
        rowNum,
        date: parsedDate,
        store: (r.store || "Unknown Store").trim(),
        product_name: r.product_name.trim(),
        units,
        total_cost: totalCost,
        sell_price: isNaN(sellPrice as number) ? null : sellPrice,
      });
    }

    if (validRows.length === 0) {
      return new Response(JSON.stringify({ receipts_created: 0, skus_created: 0, skus_flagged_review: 0, skipped }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group by date + store
    const groups = new Map<string, typeof validRows>();
    for (const row of validRows) {
      const key = `${row.date}||${row.store.toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    // Fetch existing SKUs
    const { data: existingSkus } = await supabase.from("skus").select("id, sku_name, sell_price").eq("user_id", userId);
    const skuByName = new Map<string, string>();
    const existingSkuNames: string[] = [];
    if (existingSkus) {
      for (const sku of existingSkus) {
        skuByName.set(sku.sku_name.toLowerCase(), sku.id);
        existingSkuNames.push(sku.sku_name);
      }
    }

    // Fetch reviewed items for raw name matching
    const { data: reviewedItems } = await supabase
      .from("receipt_items")
      .select("raw_name, sku_id, is_personal, pack_size")
      .eq("user_id", userId).eq("needs_review", false).not("sku_id", "is", null)
      .order("created_at", { ascending: false });
    const reviewedMap = new Map<string, { sku_id: string; is_personal: boolean; pack_size: number | null }>();
    if (reviewedItems) {
      for (const ri of reviewedItems) {
        const key = ri.raw_name.toLowerCase();
        if (!reviewedMap.has(key)) reviewedMap.set(key, { sku_id: ri.sku_id!, is_personal: ri.is_personal, pack_size: ri.pack_size });
      }
    }

    // Fetch aliases
    const { data: aliases } = await supabase
      .from("sku_aliases")
      .select("*, skus!inner(user_id)")
      .eq("skus.user_id", userId);

    // Collect all unique product names for normalization
    const allProductNames = [...new Set(validRows.map(r => r.product_name))];
    
    // Normalize with AI
    const aiConfig = await getUserAIConfig(supabase, userId, encryptionKey);
    let normalizedMap = new Map<string, string>();
    
    if (aiConfig && allProductNames.length > 0) {
      console.log(`Normalizing ${allProductNames.length} names with AI (${aiConfig.provider}/${aiConfig.model})...`);
      normalizedMap = await normalizeNamesWithAI(allProductNames, aiConfig.provider, aiConfig.apiKey, aiConfig.model, existingSkuNames);
      const inputChars = allProductNames.join("").length + 500;
      const outputChars = Array.from(normalizedMap.values()).join("").length;
      await logUsage(supabase, userId, "csv_import_normalize", aiConfig.model, inputChars, outputChars);
    } else if (allProductNames.length > 0) {
      console.log(`No AI config, trying Lovable Gateway for normalization...`);
      normalizedMap = await normalizeNamesWithGateway(allProductNames, existingSkuNames);
    }

    let receiptsCreated = 0;
    let skusCreated = 0;
    let skusFlaggedReview = 0;

    for (const [, groupRows] of groups) {
      const first = groupRows[0];
      const storeLower = first.store.toLowerCase();
      const vendor = storeLower.includes("sam") ? "sams" : storeLower.includes("walmart") ? "walmart" : "other";
      const totalCost = groupRows.reduce((s, r) => s + r.total_cost, 0);

      // Create receipt
      const { data: newReceipt, error: receiptErr } = await supabase.from("receipts").insert({
        user_id: userId,
        vendor,
        receipt_date: first.date,
        receipt_type: "csv_import",
        parse_status: "PARSED",
        store_location: first.store,
        item_count: groupRows.length,
        total: totalCost,
      }).select("id").single();

      if (receiptErr || !newReceipt) {
        console.error("Failed to create receipt:", receiptErr);
        for (const r of groupRows) skipped.push({ row: r.rowNum, reason: "Database error creating receipt" });
        continue;
      }

      receiptsCreated++;

      // Process items
      const itemsToInsert: any[] = [];
      for (const row of groupRows) {
        const unitCost = row.total_cost / row.units;
        let matchedSkuId: string | null = null;
        let matchedIsPersonal = false;
        let needsReview = true;

        // 1. Check aliases
        if (aliases) {
          for (const alias of aliases) {
            const pattern = alias.raw_name_pattern.toLowerCase();
            const rawLower = row.product_name.toLowerCase();
            if (rawLower.includes(pattern) || pattern.includes(rawLower)) {
              matchedSkuId = alias.sku_id;
              needsReview = false;
              break;
            }
          }
        }

        // 2. Check previously reviewed items
        if (needsReview) {
          const prev = reviewedMap.get(row.product_name.toLowerCase());
          if (prev) {
            matchedSkuId = prev.sku_id;
            matchedIsPersonal = prev.is_personal;
            needsReview = false;
          }
        }

        // 3. Normalized name match
        const normalizedName = normalizedMap.get(row.product_name.toLowerCase()) || row.product_name;

        if (needsReview) {
          let existingSkuId = skuByName.get(normalizedName.toLowerCase());
          if (!existingSkuId && existingSkus) {
            for (const sku of existingSkus) {
              if (fuzzyMatchSku(normalizedName, sku.sku_name)) {
                existingSkuId = sku.id;
                break;
              }
            }
          }

          if (existingSkuId) {
            matchedSkuId = existingSkuId;
            needsReview = false;
          } else {
            // Create new SKU
            const { data: newSku } = await supabase.from("skus").insert({
              user_id: userId,
              sku_name: normalizedName,
              sell_price: row.sell_price,
              rebuy_status: "Test",
            }).select("id, sku_name").single();

            if (newSku) {
              matchedSkuId = newSku.id;
              skuByName.set(newSku.sku_name.toLowerCase(), newSku.id);
              existingSkuNames.push(newSku.sku_name);
              skusCreated++;
              needsReview = true;
              skusFlaggedReview++;
            }
          }
        }

        // Update sell_price on existing SKU if provided and SKU has no sell_price
        if (matchedSkuId && row.sell_price && existingSkus) {
          const existing = existingSkus.find(s => s.id === matchedSkuId);
          if (existing && !existing.sell_price) {
            await supabase.from("skus").update({ sell_price: row.sell_price }).eq("id", matchedSkuId);
          }
        }

        itemsToInsert.push({
          receipt_id: newReceipt.id,
          user_id: userId,
          sku_id: matchedSkuId,
          raw_name: row.product_name,
          normalized_name: normalizedName,
          qty: row.units,
          unit_cost: Math.round(unitCost * 100) / 100,
          line_total: row.total_cost,
          is_personal: matchedIsPersonal,
          needs_review: needsReview,
        });
      }

      if (itemsToInsert.length > 0) {
        await supabase.from("receipt_items").insert(itemsToInsert);
      }
    }

    return new Response(JSON.stringify({
      receipts_created: receiptsCreated,
      skus_created: skusCreated,
      skus_flagged_review: skusFlaggedReview,
      skipped,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("import-csv error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
