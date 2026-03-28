

## SKU Detail Modal — Tappable SKU Names Across the App

### Overview
Create a reusable `SKUDetailModal` component (drawer/bottom sheet style) that opens when any SKU name is tapped anywhere in the app. It fetches all purchase history and profit data from the database and displays it in a scrollable, green-and-white themed modal.

### New Component: `src/components/sku/SKUDetailModal.tsx`

A Drawer (bottom sheet on mobile) that accepts `skuId` and `open`/`onClose` props.

**Data fetched on open:**
- SKU record from `skus` table (name, sell_price, category, rebuy_status)
- All `receipt_items` where `sku_id` matches, joined with `receipts` for `receipt_date` and `vendor`

**Sections displayed:**
1. **Header** — Full SKU name (untruncated), category badge, rebuy status badge, close button
2. **Purchase History** — List of each purchase: date, qty × pack_size, unit cost, line total. Sorted by date descending.
3. **Profit Breakdown** — For each purchase entry (where sell_price exists): revenue (qty × pack_size × sell_price), cost (line_total), profit (revenue - cost). Entries without sell_price show "No sell price set".
4. **Summary Card** — Total units purchased (sum of qty × pack_size), average cost per unit, total revenue, total cost, total profit. All in a compact card at the bottom.

Uses `Drawer` component for mobile-friendly bottom sheet. Content wrapped in `ScrollArea`.

### New Component: `src/components/sku/TappableSKUName.tsx`

A small wrapper component:
```
<span className="cursor-pointer underline decoration-dotted" onClick={() => open modal}>
  {children}
</span>
```
Manages the modal open state internally. Accepts `skuId` and `children` (the display name).

### Context: `src/contexts/SKUDetailContext.tsx`

A lightweight context provider wrapping the app that holds `openSKUDetail(skuId)` and renders a single `SKUDetailModal` instance. This avoids mounting multiple modals. Pages call `useSKUDetail()` to get the `openSKUDetail` function.

Add the provider in `App.tsx` inside the router.

### Pages to update (make SKU names tappable)

Each page gets a simple change — wrap SKU name text in a clickable span that calls `openSKUDetail(skuId)`:

1. **`src/pages/SKUs.tsx`** (line 303) — `sku.sku_name` in the card list view
2. **`src/pages/Index.tsx`** (line 207) — `sku.skuName` in Top 5 SKUs (needs sku_id added to the TopSku type and data)
3. **`src/pages/ReceiptDetail.tsx`** (line 130) — `item.normalized_name || item.raw_name` (only when `item.sku_id` exists)
4. **`src/pages/NeedsReview.tsx`** (line 192) — `item.raw_name` in collapsed view (only when `item.sku_id` exists)
5. **`src/pages/NeedsPrice.tsx`** (line 63) — `sku.sku_name`
6. **`src/pages/Stats.tsx`** — SKU names in the top SKUs list (need to check exact lines, but same pattern)

### Styling
- Green header bar matching `--primary: 153 60% 33%`
- White card backgrounds
- Same font and spacing as existing cards
- Profit numbers green when positive, red when negative

### Data flow
```text
User taps SKU name
  → useSKUDetail().openSKUDetail(skuId)
  → SKUDetailModal opens
  → Fetches: skus.select(*).eq(id, skuId)
  → Fetches: receipt_items.select(*, receipts(receipt_date, vendor)).eq(sku_id, skuId)
  → Renders purchase history, profit, summary
```

### Files changed/created
- **Create**: `src/contexts/SKUDetailContext.tsx`
- **Create**: `src/components/sku/SKUDetailModal.tsx`
- **Edit**: `src/App.tsx` — wrap routes with `SKUDetailProvider`
- **Edit**: `src/pages/SKUs.tsx` — make sku_name tappable
- **Edit**: `src/pages/Index.tsx` — add sku_id to TopSku, make names tappable
- **Edit**: `src/pages/ReceiptDetail.tsx` — make item names tappable when linked to SKU
- **Edit**: `src/pages/NeedsReview.tsx` — make item names tappable when linked to SKU
- **Edit**: `src/pages/NeedsPrice.tsx` — make sku_name tappable
- **Edit**: `src/pages/Stats.tsx` — make SKU names tappable in leaderboard

