

## Fix Personal Item Exclusion, Profit Label, Store Name Extraction, and Date Off-by-One

### Problem 1: Personal items not excluded from profit cost basis
In `Receipts.tsx` line 84, profit = revenue (non-personal items) - `receipt.total` (which includes personal items). This makes profit appear lower than it should. Fix: subtract only the sum of `line_total` for non-personal items instead of `receipt.total`.

### Problem 2: Label says "Est." instead of "Est. Profit"
Line 382 in `Receipts.tsx` shows `Est. +$X.XX`. Change to `Est. Profit +$X.XX`.

### Problem 3: Store name not extracted from receipt content
The AI system prompt already asks for the vendor name, but the vendor enum only supports `"sams" | "walmart"`. Non-matching stores fall back to "sams". The display code on line 372 only maps sams/walmart. Fix:
- Add a DB migration to add `"other"` to the `vendor_type` enum
- Update `parse-receipt/index.ts` to map unknown vendors to `"other"` and store the actual store name in `store_location`
- Update the AI system prompt to emphasize extracting the store name strictly from the receipt text, never guessing from products
- Update display logic in `Receipts.tsx`, `ReceiptDetail.tsx`, `Stats.tsx`, and `Index.tsx` to show `store_location` when vendor is "other", or "Unknown Store" if missing

### Problem 4: Date off by one day
Line 374: `format(new Date(r.receipt_date), "MMM d, yyyy")` — when `receipt_date` is `"2026-03-15"`, `new Date()` creates UTC midnight, which in negative-offset timezones becomes the previous day in local time. Fix: use `parseISO(r.receipt_date)` instead of `new Date(r.receipt_date)` in all date displays. Same fix needed in `ReceiptDetail.tsx`.

Also update the AI system prompt to explicitly say: extract the date exactly as printed on the receipt, do not infer it. If no date found, return null instead of guessing.

---

### Changes

**DB Migration**: `ALTER TYPE vendor_type ADD VALUE 'other';`

**`supabase/functions/parse-receipt/index.ts`**:
- Update `SYSTEM_PROMPT` to add: "Extract the store/vendor name STRICTLY from the receipt header, logo, or printed store name. Do NOT guess the store based on products. If no store name is found, return 'Unknown Store'. Extract the date exactly as printed on the receipt. If no date is found, return null."
- Change vendor enum mapping (line 887-891): add `else vendorEnum = "other"` for unrecognized vendors
- When vendor is "other", set `store_location` to `parsed.vendor` (already done on line 906)

**`src/pages/Receipts.tsx`**:
- Profit calculation: instead of `revenue - Number(r.total)`, compute `costMap` from sum of `line_total` for non-personal items, then profit = revenue - cost
- Add `line_total` to the receipt_items select query
- Change label from `Est. {sign}$X.XX` to `Est. Profit {sign}$X.XX`
- Change vendor display (line 372) to helper: `r.vendor === "sams" ? "Sam's Club" : r.vendor === "walmart" ? "Walmart" : (r as any).store_location || "Unknown Store"`
  - Need to also fetch `store_location` — it's already in `select("*")`
- Fix date: `parseISO(r.receipt_date)` instead of `new Date(r.receipt_date)`

**`src/pages/ReceiptDetail.tsx`**:
- Same vendor display fix (line 76)
- Same date fix if applicable

**`src/pages/Stats.tsx`**:
- Already handles vendor display reasonably (line 199), just add "other" → use store_location

**`src/pages/Index.tsx`**:
- Vendor display on upload insert already defaults to "sams" which is fine (AI will update it)

### Files changed
- **Migration**: Add `other` to `vendor_type` enum
- **Edit**: `supabase/functions/parse-receipt/index.ts` — system prompt + vendor mapping
- **Edit**: `src/pages/Receipts.tsx` — profit calc, label, vendor display, date fix
- **Edit**: `src/pages/ReceiptDetail.tsx` — vendor display, date fix
- **Edit**: `src/pages/Stats.tsx` — vendor display for "other"

