

## Receipt Upload in Chip Chat

### Overview
Add a file attachment button to Chip's chat input that lets users upload a receipt image/PDF directly in the conversation. The file goes through the existing `parse-receipt` edge function, and Chip responds with a conversational trip summary instead of a generic confirmation.

### Architecture

The flow is:
1. User taps paperclip icon → picks image/PDF
2. Frontend uploads file to `receipts` storage bucket, creates a `receipts` row (checking for duplicates first), calls `parse-receipt`
3. Frontend polls for parse completion (reusing Receipts.tsx pattern)
4. Once parsed, frontend fetches the receipt + items data and sends it to `chip-chat` as a special `receipt_summary` payload instead of a normal message
5. Chip responds with a conversational trip summary using its existing formatting rules

### Changes

**Edit: `src/pages/Chat.tsx`**

- Import `Paperclip` from lucide-react
- Add a hidden `<input type="file" accept="image/*,.pdf" capture="environment">` ref
- Add state: `attachedFile`, `isUploading` (for the upload+parse flow)
- Add paperclip button to the left of the text input in the form bar
- On file select:
  - Show a "Parsing receipt..." user message bubble (with a small spinner/loading indicator)
  - Upload file to `receipts` storage bucket under `{userId}/{timestamp}_{filename}`
  - **Duplicate check**: Before inserting, query `receipts` table — skip if existing receipt found with same `pdf_url` filename pattern (simple check)
  - Create receipt row with `parse_status: 'PENDING'`, `vendor: 'sams'`, `receipt_date: today`
  - Call `parse-receipt` edge function with `receipt_id` and `file_path`
  - Poll receipt status every 2s until not `PENDING`
  - If `FAILED`: add an inline assistant error message to chat ("I couldn't read that receipt. Try a clearer photo or PDF.")
  - If `PARSED`/`PARTIAL_PARSE`:
    - Fetch the parsed receipt data (store, date, total, item_count) and items (with SKU sell prices for profit calc)
    - Build a summary object with: store name, date, total spend, item count, estimated profit, notable items
    - Send to `chip-chat` with a special payload: `{ messages: [..., userMsg], receipt_context: { ... } }`
    - Chip streams back a conversational summary

**Edit: `supabase/functions/chip-chat/index.ts`**

- In the main handler, check for `receipt_context` in the request body
- If present, skip normal data fetching and instead build a receipt-specific system prompt:
  - Include the parsed receipt details (store, date, items with costs/margins)
  - Fetch the user's SKUs to calculate profit and find insights (highest margin item, price comparisons to previous purchases, overdue restocks)
  - Instruct Chip to respond with a "trip summary" following existing format rules: bold lead insight, max 3 bullets with dollar figures, one actionable recommendation
- The receipt_context includes: `receipt_id`, `store_name`, `receipt_date`, `total`, `item_count`, `items: [{name, qty, line_total, unit_cost, sell_price, pack_size}]`
- Chip's prompt should instruct: mention store + date, total spend, items parsed, estimated profit, and one insight (highest margin item, price comparison, or restock flag)

**Duplicate Prevention**
- Before creating the receipt row, check for an existing receipt with matching `store_location` + `receipt_date` + `total` for the same user
- If found, show an inline chat message: "This receipt appears to already be uploaded" and don't create a duplicate
- This check happens after parsing completes (since we don't know store/date/total until then), so do the check in the edge function and return a `duplicate: true` flag, OR do it client-side after polling shows parsed data

Actually, cleaner approach: do the duplicate check **after** parsing succeeds, client-side. Fetch the just-parsed receipt, check if another receipt exists with same vendor + receipt_date + total (excluding the one just created). If duplicate found, delete the just-created receipt and items, show error in chat.

### Technical Details

- File attachment uses the same upload pattern as `Receipts.tsx` (storage upload → receipt row → invoke parse-receipt → poll)
- The receipt summary prompt is injected as additional context in chip-chat, not a separate edge function
- Profit calculation: for each item, if SKU has `sell_price`, profit = `sell_price * qty * pack_size - line_total`
- Price comparison: fetch previous purchases of same SKUs from `receipt_items` to compare unit costs
- Restock check: reuse the same logic from `computeRestockWarnings` to flag overdue items

### Files changed
- **Edit**: `src/pages/Chat.tsx` — add paperclip button, file upload flow, receipt parsing, summary request
- **Edit**: `supabase/functions/chip-chat/index.ts` — handle `receipt_context` payload, build trip summary prompt

