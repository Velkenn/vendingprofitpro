

## Auto-approve previously reviewed items on new receipts

Currently, the `parse-receipt` edge function only matches items against `sku_aliases`. Items that were manually reviewed and mapped to SKUs on previous receipts still get flagged as `needs_review = true` on subsequent uploads.

### Fix: Match against historical receipt_items

**Edit `supabase/functions/parse-receipt/index.ts`**

After fetching `sku_aliases`, also query distinct `(raw_name, sku_id, is_personal)` pairs from `receipt_items` where `needs_review = false` and `sku_id IS NOT NULL` for this user. Use these as a secondary matching source.

During item insertion, the matching logic becomes:

1. Check `sku_aliases` first (existing behavior)
2. If no alias match, check if `raw_name` (case-insensitive) matches a previously reviewed item
3. If matched, carry forward: `sku_id`, `is_personal`, and the most recent `pack_size`
4. Only set `needs_review = true` if neither source matched

This means once a user reviews "Premier Protein 18pk" and maps it to a SKU, every future receipt with that same raw name will be auto-approved with the same SKU, personal flag, and pack size.

### No database or frontend changes needed

