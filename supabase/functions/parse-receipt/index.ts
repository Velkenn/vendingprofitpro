import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert PDF to base64 for AI (chunked to avoid stack overflow)
    const arrayBuffer = await fileData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    if (!lovableApiKey) {
      await supabase.from("receipts").update({ parse_status: "FAILED" }).eq("id", receipt_id);
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Lovable AI with tool calling for structured extraction
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a receipt parser for vending machine businesses. Extract data from PDF receipts from Sam's Club and Walmart. 
            
Detect the receipt type:
- "sams_scan_and_go" if it contains "Scan & Go"
- "walmart_store" if it contains "Store purchase" 
- "walmart_delivery" if it contains "Order" and delivery info

Extract all line items with their raw names, quantities, pack sizes (pk/ct), and prices.
Compute unit_cost = line_total / (qty * pack_size) if pack size exists, else line_total / qty.

For normalized names, use format: {Brand/Product} – {Flavor/Variant}`,
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: "receipt.pdf",
                  file_data: `data:application/pdf;base64,${base64}`,
                },
              },
              {
                type: "text",
                text: "Parse this receipt. Extract all header info and line items.",
              },
            ],
          },
        ],
        tools: [
          {
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
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_receipt" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      await supabase.from("receipts").update({ parse_status: "FAILED" }).eq("id", receipt_id);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI parsing failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall) {
      await supabase.from("receipts").update({ parse_status: "FAILED" }).eq("id", receipt_id);
      return new Response(JSON.stringify({ error: "AI did not return structured data" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    // Get the receipt to find the user_id
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

    // Determine parse status
    let extractedItems = parsed.items || [];
    const headerCount = parsed.item_count || extractedItems.length;

    // OCR fallback: if we got fewer items than expected, retry with vision-focused prompt
    if (extractedItems.length < headerCount) {
      console.log(`Partial parse: got ${extractedItems.length} of ${headerCount} items. Running OCR fallback...`);
      try {
        const ocrResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-pro",
            messages: [
              {
                role: "system",
                content: `You are an OCR specialist. The previous text-based extraction of this receipt only found ${extractedItems.length} of ${headerCount} items. Visually inspect every line of the receipt image and extract ALL line items, including ones that may have unusual formatting. Return every item you can see.`,
              },
              {
                role: "user",
                content: [
                  {
                    type: "file",
                    file: {
                      filename: "receipt.pdf",
                      file_data: `data:application/pdf;base64,${base64}`,
                    },
                  },
                  {
                    type: "text",
                    text: "Extract ALL line items from this receipt. Include every product line you can see.",
                  },
                ],
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "extract_receipt",
                  description: "Extract structured data from a receipt",
                  parameters: {
                    type: "object",
                    properties: {
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
                    required: ["items"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "extract_receipt" } },
          }),
        });

        if (ocrResponse.ok) {
          const ocrResult = await ocrResponse.json();
          const ocrToolCall = ocrResult.choices?.[0]?.message?.tool_calls?.[0];
          if (ocrToolCall) {
            const ocrParsed = JSON.parse(ocrToolCall.function.arguments);
            const ocrItems = ocrParsed.items || [];

            // Merge: add OCR items not already in first pass (dedupe by raw_name + line_total)
            const existingKeys = new Set(
              extractedItems.map((i: any) => `${i.raw_name.toLowerCase().trim()}|${i.line_total}`)
            );
            for (const ocrItem of ocrItems) {
              const key = `${ocrItem.raw_name.toLowerCase().trim()}|${ocrItem.line_total}`;
              if (!existingKeys.has(key)) {
                extractedItems.push(ocrItem);
                existingKeys.add(key);
              }
            }
            console.log(`After OCR merge: ${extractedItems.length} items (target: ${headerCount})`);
          }
        } else {
          console.error("OCR fallback failed:", ocrResponse.status);
        }
      } catch (ocrErr) {
        console.error("OCR fallback error:", ocrErr);
      }
    }

    const parseStatus = extractedItems.length >= headerCount ? "PARSED" : "PARTIAL_PARSE";

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
        // Try fuzzy match against aliases
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
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
