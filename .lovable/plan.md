

## Wire Up Dashboard with Live Data

The dashboard currently shows hardcoded `$0.00` values and empty states. We need to query `receipt_items` and `skus` to compute real metrics and display the top 5 SKUs.

### Data Queries (all in `src/pages/Index.tsx`)

**1. Stat cards — Business Spend, Personal Spend, Expected Profit (this week)**

Query `receipt_items` joined with `receipts` (for `receipt_date`) and `skus` (for `sell_price`, `pack_size`), filtered to the current week (using user's `week_start_day` from `user_settings`).

- **Business Spend**: `SUM(line_total)` where `is_personal = false`
- **Personal Spend**: `SUM(line_total)` where `is_personal = true`
- **Expected Profit**: For business items with a linked SKU that has `sell_price`: `SUM((qty * pack_size * sell_price) - line_total)`

**2. Alert badges — Needs Review count, Needs Price count**

- Needs Review: `COUNT(*)` from `receipt_items` where `needs_review = true`
- Needs Price: `COUNT(*)` from `skus` where `sell_price IS NULL` and `default_is_personal = false`

**3. Top 5 SKUs by Profit**

Query `receipt_items` joined with `skus`, grouped by SKU, computing `SUM((qty * pack_size * sell_price) - line_total)` as profit, ordered descending, limit 5. Display SKU name, total revenue, total cost, and profit.

### Implementation

**Edit `src/pages/Index.tsx`**:
- Add `useState` for `businessSpend`, `personalSpend`, `expectedProfit`, `needsReviewCount`, `needsPriceCount`, `topSkus`
- Add a `useEffect` that runs queries on mount (using the Supabase client)
- Since we can't do complex aggregation in a single Supabase REST call, we'll fetch receipt_items with their SKU data and compute client-side
- Replace hardcoded stat card values and badge counts with live data
- Render the top 5 SKUs as a simple list with profit amounts

### No database changes needed.

