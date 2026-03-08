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
        receipt_type: {
          type: "string",
          enum: ["sams_scan_and_go", "walmart_store", "walmart_delivery"],
        },
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
              normalized_name: { type: "string", description: "Format: Brand/Product – Flavor" },
              qty: { type: "integer" },
              pack_size: { type: "integer", description: "Pack count (pk/ct) if present" },
              pack_size_uom: { type: "string", description: "e.g. pk, ct, oz" },
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

async function extractPdfText(pdfBytes: Uint8Array): Promise<string> {
  const doc = await getDocument(pdfBytes).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    pages.push(`--- Page ${i} ---\n${pageText}`);
  }
  return pages.join("\n\n");
}

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

    if (!lovableApiKey) {
      await supabase.from("receipts").update({ parse_status: "FAILED" }).eq("id", receipt_id);
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PHASE 1: Extract raw text from PDF using pdfjs (all pages)
    console.log("Phase 1: Extracting text from PDF with pdfjs...");
    let rawText: string;
    try {
      rawText = await extractPdfText(bytes);
      console.log(`Phase 1 complete: extracted ${rawText.length} chars across all pages`);
    } catch (pdfErr) {
      console.error("PDF text extraction failed, falling back to AI vision:", pdfErr);
      // Fallback: use AI vision for text extraction
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);

      const textResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          max_tokens: 16384,
          messages: [
            { role: "system", content: "You are an OCR specialist. Transcribe ALL text from EVERY page of this PDF. Do not skip anything." },
            {
              role: "user",
              content: [
                { type: "file", file: { filename: "receipt.pdf", file_data: `data:application/pdf;base64,${base64}` } },
                { type: "text", text: "Transcribe ALL text from EVERY page." },
              ],
            },
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
      console.log(`AI fallback: extracted ${rawText.length} chars`);
    }

    // PHASE 2: Parse the raw text into structured data
    console.log("Phase 2: Parsing text into structured data...");
    const parseResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        max_tokens: 16384,
        messages: [
          {
            role: "system",
            content: `You are a receipt parser for vending machine businesses. Parse the raw receipt text and extract ALL items.

Detect the receipt type:
- "sams_scan_and_go" if it contains "Scan & Go"
- "walmart_store" if it's a Walmart in-store receipt
- "walmart_delivery" if it contains "Order" and delivery info

Walmart receipts: Items appear as product descriptions followed by prices. Look for patterns like "qty @ price/ea" or standalone prices after descriptions. Each product+price = one item.

Sam's Club receipts: Items may appear as single lines with item number, description, qty, and price.

CRITICAL: You MUST extract EVERY item from the text. The text below contains ALL pages of the receipt. Count carefully and do not miss any items.

Compute unit_cost = line_total / (qty * pack_size) if pack size exists, else line_total / qty.
For normalized names, use format: {Brand/Product} – {Flavor/Variant}`,
          },
          {
            role: "user",
            content: `Here is the complete raw text extracted from ALL pages of the receipt:\n\n${rawText}\n\nParse ALL items from this text. Extract every single line item.`,
          },
        ],
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "function", function: { name: "extract_receipt" } },
      }),
    });

    if (!parseResponse.ok) {
      const errText = await parseResponse.text();
      console.error("Phase 2 AI error:", parseResponse.status, errText);
      await supabase.from("receipts").update({ parse_status: "FAILED" }).eq("id", receipt_id);
      if (parseResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (parseResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI parsing failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parseResult = await parseResponse.json();
    const toolCall = parseResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      await supabase.from("receipts").update({ parse_status: "FAILED" }).eq("id", receipt_id);
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

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
    // header item_count often means total quantity, not unique line items
    // Compare total qty sum against header count to determine parse status
    const totalQty = extractedItems.reduce((sum: number, item: any) => sum + (item.qty || 1), 0);
    console.log(`Phase 2 complete: ${extractedItems.length} line items, total qty ${totalQty} (header says ${headerCount})`);

    // Consider parsed if either line count or total qty matches header count
    const parseStatus = (extractedItems.length >= headerCount || totalQty >= headerCount) ? "PARSED" : "PARTIAL_PARSE";
    console.log(`Final: ${extractedItems.length} lines, qty sum ${totalQty}, status: ${parseStatus}`);

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

    // Try to match items against user's SKU aliases
    const { data: aliases } = await supabase
      .from("sku_aliases")
      .select("*, skus!inner(user_id)")
      .eq("skus.user_id", receiptData.user_id);

    // Insert receipt items
    if (extractedItems.length > 0) {
      const itemsToInsert = extractedItems.map((item: any) => {
        let matchedSkuId = null;
        let matchedPackSize = item.pack_size || null;
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
          is_personal: false,
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
