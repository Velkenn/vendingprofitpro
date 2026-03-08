

## Improve Receipt Parsing Extraction Rate

### Problem
The Walmart receipt has 40 items but only 13 are extracted even after the OCR fallback. The logs show: first pass gets 10, OCR merge gets 13. Both AI calls are missing most items — likely because the receipt is multi-page and the models are truncating output or skipping pages.

### Root Causes
1. **First pass uses `gemini-2.5-flash`** — a lighter model that struggles with long, dense receipts
2. **The system prompt lacks explicit multi-page instructions** — no guidance to process every page
3. **The OCR fallback merges rather than replacing** — if the fallback also misses items, deduplication reduces the gain
4. **Walmart receipts have a specific format** — items appear as description line + price line pairs, which may confuse extraction

### Changes

**`supabase/functions/parse-receipt/index.ts`**

1. **Upgrade first-pass model to `google/gemini-2.5-pro`** for complex receipts (when file size > 100KB or always — Pro handles large multi-page docs much better)

2. **Improve system prompt** with explicit instructions:
   - "This receipt may span multiple pages. You MUST extract items from EVERY page."
   - "Walmart receipts list items as: description line, then price line with qty × unit price. Count each such pair as one item."
   - "The receipt header shows the total item count. Your extracted items array MUST match that count."

3. **Improve OCR fallback strategy** — instead of merging, use the fallback result as a **complete replacement** if it returns more items than the first pass. This avoids partial-merge issues.

4. **Add `max_tokens` parameter** to the AI calls (e.g., 8192) to ensure the model doesn't truncate its output for large item lists.

5. **Log the item count from both passes** for debugging.

### No database changes needed.

