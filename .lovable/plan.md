

## PWA Setup + Receipt Estimated Profit

### Part 1: Progressive Web App

**New file: `public/manifest.json`**
- `name`: "VendingTrackr", `short_name`: "VendingTrackr"
- `theme_color`: "#1a7a3c", `background_color`: "#f4f9f6"
- `display`: "standalone", `start_url`: "/", `scope`: "/"
- Icons: reference the existing `favicon.ico` at 192x192 and 512x512 (will generate simple PNG icons)

**Edit: `index.html`**
- Add `<link rel="manifest" href="/manifest.json">` in `<head>`
- Add `<meta name="theme-color" content="#1a7a3c">`
- Add `<meta name="apple-mobile-web-app-capable" content="yes">`
- Add `<meta name="apple-mobile-web-app-status-bar-style" content="default">`

**Edit: `src/main.tsx`**
- Add service worker registration guard (no `vite-plugin-pwa`):
  - Only register when NOT in iframe and NOT on preview host
  - Register `/sw.js`

**New file: `public/sw.js`**
- Minimal service worker with cache-first for static assets, network-first for API calls
- Cache name includes a version string for easy updates
- Handles `install`, `activate` (cleanup old caches), and `fetch` events

**New files: `public/icon-192.png`, `public/icon-512.png`**
- Generate simple green square icons with "VT" text using a script

### Part 2: Receipt Estimated Profit

**Concept**: For each receipt, calculate estimated profit = (sum of sell_price × qty for each receipt_item's linked SKU) - receipt total. Display as green text on each receipt card.

**Edit: `src/pages/Receipts.tsx`**
- After loading receipts, fetch all `receipt_items` for those receipts with their linked SKU sell_price:
  ```
  receipt_items: id, receipt_id, qty, sku_id, line_total
  skus: sell_price (joined via sku_id)
  ```
- Build a `Map<receiptId, estimatedProfit>` where profit = sum(sell_price × qty) - receipt.total
- On each receipt card, below the total, show: `Est. Profit: $X.XX` in green text (or hide if no SKU data)

**Where receipt cards appear**: Only `Receipts.tsx` renders the receipt list cards. The dashboard and other pages don't show individual receipt cards, so only this file needs the change.

### Files changed
- **New**: `public/manifest.json`, `public/sw.js`, `public/icon-192.png`, `public/icon-512.png`
- **Edit**: `index.html` — manifest link + meta tags
- **Edit**: `src/main.tsx` — conditional SW registration
- **Edit**: `src/pages/Receipts.tsx` — fetch receipt items with SKU sell_price, display estimated profit on each card

