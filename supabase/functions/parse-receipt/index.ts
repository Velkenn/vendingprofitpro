import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getDocument } from "https://esm.sh/pdfjs-serverless@0.3.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTRACT_TOOL = {
  type: "function",
  function: {
    name: "extract_receipt",
    description: "Extract structured data from a receipt",
    parameters: {
      type: "object",
      properties: {
        receipt_type: { type: "string", enum: ["sams_scan_and_go", "walmart_store", "walmart_delivery"] },
        vendor: { type: "string", enum: ["sams", "walmart"] },
        receipt_date: { type: "string", description: "YYYY-MM-DD format" },
        receipt_identifier: { type: "string", description: "TC number or Order number" },
        store_location: { type: "string" },
        item_count: { type: "integer" },
        subtotal: { type: "number" },
        tax: { type: "number" },
        total: { type: "number" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              raw_name: { type: "string" },
              normalized_name: { type: "string" },
              qty: { type: "integer" },
              pack_size: { type: "integer" },
              pack_size_uom: { type: "string" },
              line_total: { type: "number" },
              unit_cost: { type: "number" },
            },
            required: ["raw_name", "qty", "line_total"],
            additionalProperties: false,
          },
        },
      },
      required: ["receipt_type", "vendor", "receipt_date", "items"],
      additionalProperties: false,
    },
  },
};

interface ParsedItem {
  raw_name: string;
  normalized_name?: string;
  qty: number;
  pack_size?: number;
  pack_size_uom?: string;
  line_total: number;
  unit_cost?: number;
}

interface ParsedReceipt {
  receipt_type: string;
  vendor: string;
  receipt_date: string;
  receipt_identifier?: string;
  store_location?: string;
  item_count: number;
  subtotal?: number;
  tax?: number;
  total?: number;
  items: ParsedItem[];
}

// Extract text from PDF preserving line structure by grouping by Y-coordinate
async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  const doc = await getDocument(pdfBytes).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    
    // Group text items by Y position to reconstruct lines
    const lineMap = new Map<number, { x: number; str: string }[]>();
    for (const item of textContent.items as any[]) {
      if (!item.str || item.str.trim() === "") continue;
      // Round Y to nearest integer to group items on the same line
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push({ x: item.transform[4], str: item.str });
    }
    
    // Sort by Y descending (PDF coordinates: top = higher Y), then X ascending within each line
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const lineTexts: string[] = [];
    for (const y of sortedYs) {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x);
      lineTexts.push(items.map(i => i.str).join("  "));
    }
    
    pages.push(`--- Page ${i} ---\n${lineTexts.join("\n")}`);
  }
  return pages.join("\n\n");
}

// Extract a date in MM/DD/YYYY or MM/DD/YY format and return as YYYY-MM-DD
function extractDate(text: string): string | null {
  const m = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!m) return null;
  const month = m[1].padStart(2, "0");
  const day = m[2].padStart(2, "0");
  let year = m[3];
  if (year.length === 2) year = "20" + year;
  return `${year}-${month}-${day}`;
}

// Extract a dollar amount from text
function extractAmount(text: string, pattern: RegExp): number | null {
  const m = text.match(pattern);
  if (!m) return null;
  return parseFloat(m[1]);
}

// Extract pack size info from item name
function extractPackSize(name: string): { pack_size?: number; pack_size_uom?: string } {
  const m = name.match(/(\d+)\s*(pk|ct|oz|fl\s*oz|count|pack)\b/i);
  if (!m) return {};
  return { pack_size: parseInt(m[1]), pack_size_uom: m[2].toLowerCase().replace(/\s+/g, "") };
}

// ─── SAM'S CLUB PARSER ────────────────────────────────────────────
function parseSamsReceipt(text: string): ParsedReceipt | null {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];

  // Detect Scan & Go vs regular Sam's
  const isScanAndGo = /scan\s*&\s*go/i.test(text);
  const receiptType = isScanAndGo ? "sams_scan_and_go" : "sams_scan_and_go"; // default to scan_and_go for sams

  // Extract date
  const receiptDate = extractDate(text) || new Date().toISOString().slice(0, 10);

  // Extract TC number
  const tcMatch = text.match(/TC#?\s*:?\s*(\d[\d\s\-]+\d)/i);
  const receiptIdentifier = tcMatch ? tcMatch[1].replace(/\s+/g, "") : undefined;

  // Extract store location
  const storeMatch = text.match(/(?:Sam'?s\s*Club)\s*#?\s*(\d+)/i) || text.match(/Club\s*#?\s*(\d+)/i);
  const storeLocation = storeMatch ? `Sam's Club #${storeMatch[1]}` : undefined;

  // Sam's Club item patterns:
  // Pattern 1: "981234  MONSTER ENRGY  1  8.98  E"
  // Pattern 2: "ITEM DESCRIPTION  8.98  E"
  const samsItemRegex = /^(\d{4,8})?\s*(.+?)\s{2,}(\d+)\s{2,}(-?\d+\.\d{2})\s*[A-Z]?\s*$/;
  const samsItemRegex2 = /^(.+?)\s{2,}(\d+)\s{2,}(-?\d+\.\d{2})\s*[A-Z]?\s*$/;
  // Simple pattern: description followed by price at end
  const simpleItemRegex = /^(\d{4,8})?\s*(.+?)\s+(-?\d+\.\d{2})\s*[A-Z]?\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header/footer lines
    if (/^(subtotal|tax|total|change|visa|mastercard|amex|debit|cash|member|thank|---|page|\*)/i.test(line)) continue;
    if (/TC#|Scan\s*&\s*Go|Sam'?s\s*Club|^\d{1,2}[\/\-]\d{1,2}[\/\-]/i.test(line)) continue;

    let match = line.match(samsItemRegex);
    if (match) {
      const rawName = (match[1] ? match[1] + " " : "") + match[2].trim();
      const qty = parseInt(match[3]);
      const lineTotal = parseFloat(match[4]);
      const packInfo = extractPackSize(rawName);
      const divisor = qty * (packInfo.pack_size || 1);
      items.push({
        raw_name: rawName,
        qty,
        line_total: lineTotal,
        unit_cost: divisor > 0 ? Math.round((lineTotal / divisor) * 100) / 100 : undefined,
        ...packInfo,
      });
      continue;
    }

    match = line.match(samsItemRegex2);
    if (match) {
      const rawName = match[1].trim();
      const qty = parseInt(match[2]);
      const lineTotal = parseFloat(match[3]);
      if (rawName.length < 3) continue;
      const packInfo = extractPackSize(rawName);
      const divisor = qty * (packInfo.pack_size || 1);
      items.push({
        raw_name: rawName,
        qty,
        line_total: lineTotal,
        unit_cost: divisor > 0 ? Math.round((lineTotal / divisor) * 100) / 100 : undefined,
        ...packInfo,
      });
      continue;
    }

    match = line.match(simpleItemRegex);
    if (match) {
      const rawName = ((match[1] || "") + " " + match[2]).trim();
      const lineTotal = parseFloat(match[3]);
      if (rawName.length < 3 || lineTotal === 0) continue;
      // Skip if it looks like a summary line
      if (/subtotal|tax|total|balance|tender/i.test(rawName)) continue;
      const packInfo = extractPackSize(rawName);
      items.push({
        raw_name: rawName,
        qty: 1,
        line_total: lineTotal,
        unit_cost: lineTotal / (packInfo.pack_size || 1),
        ...packInfo,
      });
    }
  }

  if (items.length === 0) return null;

  const subtotal = extractAmount(text, /subtotal\s*:?\s*\$?\s*(\d+\.\d{2})/i);
  const tax = extractAmount(text, /tax\s*:?\s*\$?\s*(\d+\.\d{2})/i);
  const total = extractAmount(text, /total\s*:?\s*\$?\s*(\d+\.\d{2})/i);

  return {
    receipt_type: receiptType,
    vendor: "sams",
    receipt_date: receiptDate,
    receipt_identifier: receiptIdentifier,
    store_location: storeLocation,
    item_count: items.length,
    subtotal: subtotal ?? undefined,
    tax: tax ?? undefined,
    total: total ?? undefined,
    items,
  };
}

// ─── WALMART IN-STORE PARSER ──────────────────────────────────────
function parseWalmartStoreReceipt(text: string): ParsedReceipt | null {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];

  const receiptDate = extractDate(text) || new Date().toISOString().slice(0, 10);

  // Extract identifiers like ST# OP# TE# TR#
  const idMatch = text.match(/TC#?\s*:?\s*([\d\s\-]+)/i) || text.match(/TR#?\s*:?\s*(\d+)/i);
  const receiptIdentifier = idMatch ? idMatch[1].trim().replace(/\s+/g, "") : undefined;

  // Store location
  const storeMatch = text.match(/ST#?\s*:?\s*(\d+)/i) || text.match(/Walmart\s*(?:Store)?\s*#?\s*(\d+)/i);
  const storeLocation = storeMatch ? `Walmart #${storeMatch[1]}` : undefined;

  // Walmart patterns:
  // "GREAT VALUE WATER  3.98 O"  (description, price, tax code)
  // Then optionally on next line: "2 @ 1.99/ea" (multi-qty)
  const walmartItemRegex = /^(.+?)\s{2,}(-?\d+\.\d{2})\s*([A-Z])?\s*$/;
  const qtyLineRegex = /^(\d+)\s*@\s*(\d+\.\d{2})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header/footer/summary lines
    if (/^(subtotal|tax|total|change|visa|mastercard|amex|debit|cash|tend|thank|---|ST#|OP#|TE#|TR#|\*|walmart|saving)/i.test(line)) continue;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]/.test(line)) continue;

    const match = line.match(walmartItemRegex);
    if (match) {
      const rawName = match[1].trim();
      const lineTotal = parseFloat(match[2]);

      // Skip summary-like entries
      if (/subtotal|tax|total|balance|tender|change due/i.test(rawName)) continue;
      if (rawName.length < 2) continue;

      let qty = 1;
      // Check next line for qty pattern
      if (i + 1 < lines.length) {
        const qtyMatch = lines[i + 1].match(qtyLineRegex);
        if (qtyMatch) {
          qty = parseInt(qtyMatch[1]);
          i++; // skip qty line
        }
      }

      const packInfo = extractPackSize(rawName);
      const divisor = qty * (packInfo.pack_size || 1);
      items.push({
        raw_name: rawName,
        qty,
        line_total: lineTotal,
        unit_cost: divisor > 0 ? Math.round((lineTotal / divisor) * 100) / 100 : undefined,
        ...packInfo,
      });
    }
  }

  if (items.length === 0) return null;

  const subtotal = extractAmount(text, /subtotal\s*:?\s*\$?\s*(\d+\.\d{2})/i);
  const tax = extractAmount(text, /tax\s*:?\s*\$?\s*(\d+\.\d{2})/i);
  const total = extractAmount(text, /total\s*:?\s*\$?\s*(\d+\.\d{2})/i);

  return {
    receipt_type: "walmart_store",
    vendor: "walmart",
    receipt_date: receiptDate,
    receipt_identifier: receiptIdentifier,
    store_location: storeLocation,
    item_count: items.length,
    subtotal: subtotal ?? undefined,
    tax: tax ?? undefined,
    total: total ?? undefined,
    items,
  };
}

// ─── WALMART DELIVERY PARSER ──────────────────────────────────────
function parseWalmartDeliveryReceipt(text: string): ParsedReceipt | null {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const items: ParsedItem[] = [];

  const receiptDate = extractDate(text) || new Date().toISOString().slice(0, 10);

  const orderMatch = text.match(/Order\s*#?\s*:?\s*([\d\-]+)/i);
  const receiptIdentifier = orderMatch ? orderMatch[1] : undefined;

  // Delivery items often appear as: "Product Name  Qty X  $Price" or similar
  // Pattern: description, qty, price
  const deliveryItemRegex = /^(.+?)\s{2,}(?:(?:Qty|x)\s*)?(\d+)\s{2,}\$?(-?\d+\.\d{2})\s*$/i;
  // Or: description then price (qty=1)
  const simpleDeliveryRegex = /^(.+?)\s{2,}\$?(-?\d+\.\d{2})\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^(subtotal|tax|total|order|delivery|shipping|thank|walmart|saving|fee|tip)/i.test(line)) continue;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]/.test(line)) continue;

    let match = line.match(deliveryItemRegex);
    if (match) {
      const rawName = match[1].trim();
      const qty = parseInt(match[2]);
      const lineTotal = parseFloat(match[3]);
      if (rawName.length < 2 || /subtotal|tax|total|fee/i.test(rawName)) continue;
      const packInfo = extractPackSize(rawName);
      const divisor = qty * (packInfo.pack_size || 1);
      items.push({
        raw_name: rawName,
        qty,
        line_total: lineTotal,
        unit_cost: divisor > 0 ? Math.round((lineTotal / divisor) * 100) / 100 : undefined,
        ...packInfo,
      });
      continue;
    }

    match = line.match(simpleDeliveryRegex);
    if (match) {
      const rawName = match[1].trim();
      const lineTotal = parseFloat(match[2]);
      if (rawName.length < 2 || lineTotal === 0) continue;
      if (/subtotal|tax|total|fee|delivery|shipping|tip|order|balance/i.test(rawName)) continue;
      const packInfo = extractPackSize(rawName);
      items.push({
        raw_name: rawName,
        qty: 1,
        line_total: lineTotal,
        unit_cost: lineTotal / (packInfo.pack_size || 1),
        ...packInfo,
      });
    }
  }

  if (items.length === 0) return null;

  const subtotal = extractAmount(text, /subtotal\s*:?\s*\$?\s*(\d+\.\d{2})/i);
  const tax = extractAmount(text, /tax\s*:?\s*\$?\s*(\d+\.\d{2})/i);
  const total = extractAmount(text, /total\s*:?\s*\$?\s*(\d+\.\d{2})/i);

  return {
    receipt_type: "walmart_delivery",
    vendor: "walmart",
    receipt_date: receiptDate,
    receipt_identifier: receiptIdentifier,
    store_location: undefined,
    item_count: items.length,
    subtotal: subtotal ?? undefined,
    tax: tax ?? undefined,
    total: total ?? undefined,
    items,
  };
}

// ─── ORCHESTRATOR ─────────────────────────────────────────────────
function parseReceiptText(rawText: string): ParsedReceipt | null {
  const lower = rawText.toLowerCase();

  // Detect type and try appropriate parser
  if (/sam'?s\s*club|scan\s*&\s*go/i.test(rawText)) {
    const result = parseSamsReceipt(rawText);
    if (result && result.items.length > 0) return result;
  }

  if (/order\s*#|delivery|walmart\.com/i.test(rawText)) {
    const result = parseWalmartDeliveryReceipt(rawText);
    if (result && result.items.length > 0) return result;
  }

  if (/walmart/i.test(rawText)) {
    const result = parseWalmartStoreReceipt(rawText);
    if (result && result.items.length > 0) return result;
  }

  // Try all parsers as fallback
  for (const parser of [parseSamsReceipt, parseWalmartStoreReceipt, parseWalmartDeliveryReceipt]) {
    const result = parser(rawText);
    if (result && result.items.length > 0) return result;
  }

  return null;
}

const SYSTEM_PROMPT = `You are a receipt parser for vending machine businesses. Parse the raw receipt text and extract ALL items.

Detect the receipt type:
- "sams_scan_and_go" if it contains "Scan & Go"
- "walmart_store" if it's a Walmart in-store receipt
- "walmart_delivery" if it contains "Order" and delivery info

Walmart receipts: Items appear as product descriptions followed by prices. Look for patterns like "qty @ price/ea" or standalone prices after descriptions. Each product+price = one item.

Sam's Club receipts: Items may appear as single lines with item number, description, qty, and price.

CRITICAL: You MUST extract EVERY item from the text. Count carefully and do not miss any items.

Compute unit_cost = line_total / (qty * pack_size) if pack size exists, else line_total / qty.
For normalized names, use format: {Brand/Product} – {Flavor/Variant}`;

function buildUserPrompt(rawText: string): string {
  return `Here is the complete raw text extracted from ALL pages of the receipt:\n\n${rawText}\n\nParse ALL items from this text. Extract every single line item.`;
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

// ─── AI PARSING WITH USER'S PROVIDER ─────────────────────────────
async function parseWithUserProvider(
  rawText: string,
  provider: string,
  apiKey: string,
  model: string
): Promise<any> {
  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16384,
        system: SYSTEM_PROMPT,
        tools: [{
          name: "extract_receipt",
          description: EXTRACT_TOOL.function.description,
          input_schema: EXTRACT_TOOL.function.parameters,
        }],
        tool_choice: { type: "tool", name: "extract_receipt" },
        messages: [{ role: "user", content: buildUserPrompt(rawText) }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI_ERROR:${res.status}:${t}`);
    }
    const result = await res.json();
    const toolUse = result.content?.find((c: any) => c.type === "tool_use");
    if (!toolUse) throw new Error("AI did not return structured data");
    return toolUse.input;
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16384,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(rawText) },
        ],
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "function", function: { name: "extract_receipt" } },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI_ERROR:${res.status}:${t}`);
    }
    const result = await res.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured data");
    return parseToolCallResult(toolCall);
  }

  if (provider === "google") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: buildUserPrompt(rawText) }] }],
          tools: [{
            functionDeclarations: [{
              name: "extract_receipt",
              description: EXTRACT_TOOL.function.description,
              parameters: EXTRACT_TOOL.function.parameters,
            }],
          }],
          toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["extract_receipt"] } },
          generationConfig: { maxOutputTokens: 16384 },
        }),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI_ERROR:${res.status}:${t}`);
    }
    const result = await res.json();
    const fc = result.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall);
    if (!fc) throw new Error("AI did not return structured data");
    return fc.functionCall.args;
  }

  throw new Error(`Unknown provider: ${provider}`);
}

// Get user's configured AI provider
async function getUserAIConfig(supabase: any, userId: string, encryptionKey: string) {
  const { data, error } = await supabase
    .from("ai_provider_settings")
    .select("provider, encrypted_api_key, model, is_default")
    .eq("user_id", userId)
    .eq("is_default", true)
    .single();

  if (error || !data) {
    // Try any provider if no default
    const { data: any_provider } = await supabase
      .from("ai_provider_settings")
      .select("provider, encrypted_api_key, model")
      .eq("user_id", userId)
      .limit(1)
      .single();
    if (!any_provider) return null;

    // Decrypt key
    const { data: decrypted } = await supabase.rpc("decrypt_ai_key", {
      encrypted_text: any_provider.encrypted_api_key,
      enc_key: encryptionKey,
    });
    return { provider: any_provider.provider, apiKey: decrypted, model: any_provider.model };
  }

  const { data: decrypted } = await supabase.rpc("decrypt_ai_key", {
    encrypted_text: data.encrypted_api_key,
    enc_key: encryptionKey,
  });
  return { provider: data.provider, apiKey: decrypted, model: data.model };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { receipt_id, file_path } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Download the PDF
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("receipts")
      .download(file_path);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      await supabase.from("receipts").update({ parse_status: "FAILED" }).eq("id", receipt_id);
      return new Response(JSON.stringify({ error: "Failed to download PDF" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // PHASE 1: Extract raw text from PDF
    console.log("Phase 1: Extracting text from PDF with pdfjs...");
    let rawText: string;
    try {
      rawText = await extractPdfText(bytes);
      console.log(`Phase 1 complete: extracted ${rawText.length} chars`);
    } catch (pdfErr) {
      console.error("PDF text extraction failed:", pdfErr);
      if (!lovableApiKey) {
        await supabase.from("receipts").update({ parse_status: "FAILED" }).eq("id", receipt_id);
        return new Response(JSON.stringify({ error: "PDF extraction failed and no AI key configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // AI vision fallback for text extraction
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      const textResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: 16384,
          messages: [
            { role: "system", content: "You are an OCR specialist. Transcribe ALL text from EVERY page of this PDF." },
            { role: "user", content: [
              { type: "file", file: { filename: "receipt.pdf", file_data: `data:application/pdf;base64,${base64}` } },
              { type: "text", text: "Transcribe ALL text from EVERY page." },
            ]},
          ],
        }),
      });
      if (!textResponse.ok) {
        await supabase.from("receipts").update({ parse_status: "FAILED" }).eq("id", receipt_id);
        return new Response(JSON.stringify({ error: "Text extraction failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const textResult = await textResponse.json();
      rawText = textResult.choices?.[0]?.message?.content || "";
      console.log(`AI OCR fallback: extracted ${rawText.length} chars`);
    }

    // PHASE 2: Parse text — try regex first, then AI fallback
    console.log("Phase 2: Attempting regex-based parsing...");
    let parsed: any = parseReceiptText(rawText);

    if (parsed && parsed.items.length > 0) {
      console.log(`Regex parser succeeded: ${parsed.items.length} items found`);
    } else {
      console.log("Regex parser found 0 items, falling back to AI...");
      if (!lovableApiKey) {
        await supabase.from("receipts").update({ parse_status: "FAILED" }).eq("id", receipt_id);
        return new Response(JSON.stringify({ error: "Regex parsing failed and no AI key configured" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        parsed = await parseWithAI(rawText, lovableApiKey);
        console.log(`AI fallback succeeded: ${parsed.items?.length || 0} items`);
      } catch (aiErr: any) {
        console.error("AI fallback error:", aiErr.message);
        await supabase.from("receipts").update({ parse_status: "FAILED" }).eq("id", receipt_id);
        const msg = aiErr.message || "";
        if (msg.includes("AI_ERROR:429")) {
          return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (msg.includes("AI_ERROR:402")) {
          return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "Parsing failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get the receipt user_id
    const { data: receiptData } = await supabase
      .from("receipts")
      .select("user_id")
      .eq("id", receipt_id)
      .single();

    if (!receiptData) {
      return new Response(JSON.stringify({ error: "Receipt not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extractedItems = parsed.items || [];
    const headerCount = parsed.item_count || extractedItems.length;
    const totalQty = extractedItems.reduce((sum: number, item: any) => sum + (item.qty || 1), 0);
    console.log(`${extractedItems.length} line items, total qty ${totalQty} (header says ${headerCount})`);

    const parseStatus = (extractedItems.length >= headerCount || totalQty >= headerCount) ? "PARSED" : "PARTIAL_PARSE";
    console.log(`Final status: ${parseStatus}`);

    // Update receipt header
    await supabase.from("receipts").update({
      vendor: parsed.vendor,
      receipt_type: parsed.receipt_type,
      receipt_date: parsed.receipt_date,
      receipt_identifier: parsed.receipt_identifier || null,
      store_location: parsed.store_location || null,
      item_count: headerCount,
      subtotal: parsed.subtotal || null,
      tax: parsed.tax || null,
      total: parsed.total || null,
      parse_status: parseStatus,
    }).eq("id", receipt_id);

    // Match items against SKU aliases and previously reviewed items
    const { data: aliases } = await supabase
      .from("sku_aliases")
      .select("*, skus!inner(user_id)")
      .eq("skus.user_id", receiptData.user_id);

    const { data: reviewedItems } = await supabase
      .from("receipt_items")
      .select("raw_name, sku_id, is_personal, pack_size")
      .eq("user_id", receiptData.user_id)
      .eq("needs_review", false)
      .not("sku_id", "is", null)
      .order("created_at", { ascending: false });

    const reviewedMap = new Map<string, { sku_id: string; is_personal: boolean; pack_size: number | null }>();
    if (reviewedItems) {
      for (const ri of reviewedItems) {
        const key = ri.raw_name.toLowerCase();
        if (!reviewedMap.has(key)) {
          reviewedMap.set(key, { sku_id: ri.sku_id!, is_personal: ri.is_personal, pack_size: ri.pack_size });
        }
      }
    }

    if (extractedItems.length > 0) {
      const itemsToInsert = extractedItems.map((item: any) => {
        let matchedSkuId = null;
        let matchedPackSize = item.pack_size || null;
        let matchedIsPersonal = false;
        let needsReview = true;

        if (aliases) {
          for (const alias of aliases) {
            if (alias.vendor === parsed.vendor) {
              const pattern = alias.raw_name_pattern.toLowerCase();
              const rawName = item.raw_name.toLowerCase();
              if (rawName.includes(pattern) || pattern.includes(rawName)) {
                matchedSkuId = alias.sku_id;
                if (alias.pack_size_override) matchedPackSize = alias.pack_size_override;
                needsReview = false;
                break;
              }
            }
          }
        }

        if (needsReview) {
          const prev = reviewedMap.get(item.raw_name.toLowerCase());
          if (prev) {
            matchedSkuId = prev.sku_id;
            matchedIsPersonal = prev.is_personal;
            if (prev.pack_size) matchedPackSize = prev.pack_size;
            needsReview = false;
          }
        }

        return {
          receipt_id,
          user_id: receiptData.user_id,
          sku_id: matchedSkuId,
          raw_name: item.raw_name,
          normalized_name: item.normalized_name || null,
          qty: item.qty || 1,
          pack_size: matchedPackSize,
          pack_size_uom: item.pack_size_uom || null,
          unit_cost: item.unit_cost || null,
          line_total: item.line_total,
          is_personal: matchedIsPersonal,
          needs_review: needsReview,
        };
      });

      await supabase.from("receipt_items").insert(itemsToInsert);
    }

    return new Response(JSON.stringify({ success: true, parse_status: parseStatus }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-receipt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
