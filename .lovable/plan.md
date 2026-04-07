

## CSV Import Feature for Receipts

### Overview
Add a CSV import flow that lets operators bulk-upload historical purchase data. Rows sharing the same Date+Store are grouped into single receipt records. Product names go through AI SKU normalization. A summary screen shows results after import.

### 1. Database Changes

**Migration**: Add `csv_import` to the `receipt_type` enum so imported receipts can be identified:
```sql
ALTER TYPE public.receipt_type ADD VALUE IF NOT EXISTS 'csv_import';
```

No new tables needed — imports create standard `receipts` + `receipt_items` rows.

### 2. Edge Function: `import-csv`

**Create: `supabase/functions/import-csv/index.ts`**

Accepts `{ rows: [{date, store, product_name, units, total_cost, sell_price}], user_id }`.

For each valid row:
- Parse date (supports M/D/YYYY, MM/DD/YYYY, MM/DD/YY, "Month D, YYYY", ISO 8601)
- Calculate `unit_cost = total_cost / units`
- Group rows by `date + store` → one receipt per group

For each receipt group:
- Insert into `receipts` with `vendor: 'other'`, `receipt_type: 'csv_import'`, `parse_status: 'PARSED'`
- Collect all product names, run through the existing `normalizeNamesWithAI()` + `fuzzyMatchSku()` logic (reused from parse-receipt)
- Match/create SKUs exactly as parse-receipt does (aliases → reviewed items → normalized name match → auto-create)
- If a `sell_price` is provided and a new SKU is created, set `sell_price` on the SKU
- Insert `receipt_items` with `needs_review: true` for new SKUs, `false` for matched ones

Skip rows with missing Date, Product Name, or Total Cost — collect `{row, reason}` for each skip.

Return: `{ receipts_created, skus_created, skus_flagged_review, skipped: [{row, reason}] }`

### 3. Frontend: CSV Import UI

**Edit: `src/pages/Receipts.tsx`**

- Add "Import CSV" button next to existing "Upload" button in the header
- Add a hidden `<input type="file" accept=".csv">` ref
- Add state for CSV import flow: `csvImporting`, `csvResults`, `csvError`

**Import flow states:**
1. **Idle** — button visible
2. **Processing** — show spinner + "Importing X rows..."
3. **Done** — summary card showing:
   - Receipts created count
   - SKUs created count  
   - SKUs flagged for review count
   - Skipped rows list (row number + reason)
4. **Error** — error message + retry

**CSV parsing**: Use client-side parsing (split by newlines, split by comma with basic quote handling). Validate headers match expected columns. Send parsed rows to the edge function.

**Template download**: Add a "Download Template" link that generates and downloads a CSV file with headers `Date,Store,Product Name,Units,Total Cost,Sell Price` and one example row: `01/15/2025,Sam's Club,Monster Energy Zero Ultra 12pk,2,36.96,2.00`.

### 4. "Imported" Badge on Receipt Cards

**Edit: `src/pages/Receipts.tsx`** and **`src/pages/ReceiptDetail.tsx`**

- Check `receipt.receipt_type === 'csv_import'` 
- Show a small `<Badge>Imported</Badge>` next to the store name on the receipt card
- Also show on the receipt detail page header

### 5. Receipt Status for Imports

Since imported receipts use `parse_status: 'PARSED'`, they'll show the standard "Parsed" badge. The `receipt_type: 'csv_import'` field distinguishes them without affecting any existing logic in Stats, Chip, or SKU history.

### Files changed
- **Migration**: Add `csv_import` to `receipt_type` enum
- **Create**: `supabase/functions/import-csv/index.ts` — CSV processing, SKU matching, receipt creation
- **Edit**: `src/pages/Receipts.tsx` — add Import CSV button, template download, processing UI, summary screen, "Imported" badge on cards
- **Edit**: `src/pages/ReceiptDetail.tsx` — show "Imported" badge on detail view

