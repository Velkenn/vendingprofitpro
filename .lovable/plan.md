

## Enhance Needs Review: Create SKU inline, auto-fill pack_size, set sell price

### Changes to `src/pages/NeedsReview.tsx`

**1. "Create New SKU" in dropdown**
- When SKU search has no exact match, show a "+ Create [term]" button
- Clicking opens inline fields: SKU name (pre-filled from search), sell price, category
- Inserts into `skus` table with `user_id`, auto-selects the new SKU on the form
- Appends new SKU to local `skus` state so it's immediately available

**2. Auto-fill pack_size**
- When a SKU is selected (existing or newly created), query the most recent `receipt_items` row with that `sku_id` to get its `pack_size`
- Pre-fill the pack_size field with that value (still editable)
- For brand new SKUs with no history, leave pack_size blank for first entry

**3. Sell price field on new SKU creation**
- Include a "Sell Price" input in the inline create form
- Saved directly to `skus.sell_price` on insert
- Existing SKUs already have their sell price set elsewhere, so this only appears during creation

### No database changes needed
All required columns (`skus.sell_price`, `skus.sku_name`, `skus.user_id`, `receipt_items.pack_size`) already exist.

