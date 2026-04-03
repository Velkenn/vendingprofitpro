

## Assign Store to Receipt + Clickable Store Drill-Down

### 1. Editable store on receipt detail page (`src/pages/ReceiptDetail.tsx`)

Add a tappable store name that opens an inline edit mode or a select dropdown. The user can type or pick a store name, then save it to the `store_location` field (and optionally update `vendor` to match sams/walmart/other).

- Make the store title (line 76) tappable — on tap, show an Input field pre-filled with current `store_location`
- Add state: `editingStore`, `storeValue`
- On save, update `receipts` table: set `store_location` to the new value, set `vendor` to "sams" if it contains "sam", "walmart" if it contains "walmart", else "other"
- Show a pencil icon next to the store name to indicate editability

### 2. Editable store on receipt cards in Receipts list (`src/pages/Receipts.tsx`)

Not needed on the list — users can tap into the receipt detail to change the store. Keep the list read-only.

### 3. Clickable stores on Stats page (`src/pages/Stats.tsx`)

Make each store row in "Spend by Store" clickable. On tap, open a dialog/sheet showing all receipts from that store, grouped by month (same layout as Receipts tab).

- Add state: `selectedStore: string | null`
- When a store row is tapped, set `selectedStore` to the store label (e.g. "Sam's Club — Mckinney")
- Render a Sheet (bottom sheet) with the store name as title
- Inside the sheet, filter `items` to only those matching the store, extract unique receipt IDs, then fetch those receipts
- Group receipts by month with collapsible sections (reuse same pattern from Receipts.tsx)
- Most recent month expanded, older months collapsed
- Each receipt card is tappable and navigates to `/receipts/:id`

**Data approach**: The Stats page already has all `receipt_items` with joined `receipts` data. From `selectedStore`, derive the matching receipt IDs by matching vendor/store_location against the store label. Then fetch full receipt records for those IDs to display cards with totals and dates.

### 4. Store receipts view data flow

- From `filteredItems`, collect all receipt IDs where the store matches
- Fetch those receipts from Supabase (or derive from existing data)
- Group by month, show collapsible sections with count and total spend
- Include est. profit per receipt (reuse existing profit map logic)

### Files changed
- **Edit**: `src/pages/ReceiptDetail.tsx` — add inline store name editing with save
- **Edit**: `src/pages/Stats.tsx` — make store rows clickable, add Sheet with filtered receipts grouped by month

