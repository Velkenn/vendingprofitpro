

## Replace AI Parsing with Regex-Based Parser (AI Fallback)

### What's changing
Phase 2 of `parse-receipt` currently sends the extracted PDF text to an AI model for structured parsing. This will be replaced with deterministic regex-based parsing for Sam's Club and Walmart receipts, using AI only as a fallback if regex extracts zero items.

### How it works

**File: `supabase/functions/parse-receipt/index.ts`**

#### 1. Add regex parser functions

Three parser functions, each returning the same structure the AI currently produces:

- **`parseSamsReceipt(text)`** — Sam's Club Scan & Go format:
  - Detect via "Scan & Go" or "Sam's Club" in text
  - Items typically: item number, description, qty, price on structured lines
  - Extract date from patterns like "MM/DD/YYYY"
  - Extract TC number, subtotal, tax, total
  - Extract store location

- **`parseWalmartStoreReceipt(text)`** — Walmart in-store:
  - Items appear as description followed by price, with optional "qty @ price/ea"
  - Extract ST#/OP#/TE#/TR# identifiers
  - Extract date, subtotal, tax, total

- **`parseWalmartDeliveryReceipt(text)`** — Walmart delivery/online:
  - Detect via "Order#" or delivery-related keywords
  - Items with quantities and prices in delivery format

Each returns: `{ receipt_type, vendor, receipt_date, receipt_identifier, store_location, item_count, subtotal, tax, total, items[] }`

#### 2. Add orchestrator function

`parseReceiptText(rawText)` that:
1. Detects receipt type from text keywords
2. Calls the appropriate parser
3. Returns parsed result or `null` if zero items found

#### 3. Update Phase 2 flow

Replace the current AI-only Phase 2 with:
```
1. Try regex parsing via parseReceiptText(rawText)
2. If result has items → use it (no AI cost)
3. If result is null or has 0 items → fall back to existing AI call
```

#### 4. Improve pdfjs text extraction

Currently joins all text items with spaces (losing line structure). Change to preserve positional info by grouping text items by Y-coordinate to reconstruct lines — this makes regex patterns much more reliable.

### Key patterns to handle

**Sam's Club** — items like: `981234 MONSTER ENRGY 1 8.98 E`
- Regex: `/^(\d{5,7})\s+(.+?)\s+(\d+)\s+(\d+\.\d{2})\s*[A-Z]?$/`

**Walmart in-store** — items like: `GREAT VALUE WATER    3.98 O` or `2 @ 1.99/ea  3.98`
- Price at end of line, optional tax code letter
- Multi-quantity with `@ price/ea` pattern

**Walmart delivery** — items with qty × price format

### Result
- Most receipts parse instantly with zero AI cost
- AI fallback ensures new/unusual formats still work
- Faster processing (no network round-trip to AI for Phase 2)

