

## Merge Upload into Receipts + New Stats Tab

### Overview
Move the upload flow into the Receipts page (inline), repurpose the `/upload` route and bottom nav tab as a **Stats** dashboard showing SKU purchase volume, unit economics, and time-filtered business totals.

### Changes

**`src/pages/Receipts.tsx`** — Add inline upload flow
- Import the upload logic from Upload.tsx (file picker, upload+parse states, polling)
- The existing "Upload" button at top-right triggers the inline flow (expands a card with file picker + progress states within the Receipts page)
- After successful parse, refresh the receipts list and collapse the upload card

**`src/pages/Stats.tsx`** — New file (replaces Upload.tsx)
- Fetch all `receipt_items` joined with `skus` (for sku_name, sell_price) and `receipts` (for receipt_date), filtering `is_personal = false`
- **SKU Leaderboard section**: Group by sku_id, sum `qty * pack_size` as total units, compute avg unit_cost and profit per unit (`sell_price - unit_cost`). Sort by total units descending. Show top 10 prominently, rest in a scrollable list below.
- **Summary cards with time tabs** (Week / Month / Year / Lifetime): Filter receipt_items by receipt_date range. Show:
  - Total Business Spend (sum of line_total where not personal)
  - Total Profit (sum of `(sell_price - unit_cost) * qty * pack_size` where sell_price exists)
  - Avg Unit Cost, Avg Unit Profit
  - Total Units Purchased

**`src/components/BottomNav.tsx`** — Change Upload tab to Stats
- Replace `Upload` icon with `BarChart3`, label "Stats", path `/stats`

**`src/App.tsx`** — Update routes
- Replace `/upload` route with `/stats` pointing to new Stats component
- Keep Upload import removed; add Stats import

**`src/pages/Upload.tsx`** — Delete (logic moves into Receipts.tsx)

### Data query approach
Single query: `receipt_items` with `receipts!inner(receipt_date)` and `skus(sku_name, sell_price)`, filtered by user. All aggregation done client-side since data volume is manageable per-user.

