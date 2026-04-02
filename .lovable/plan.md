

## Dashboard Redesign + Native Mobile Feel

### Part 1: Rewrite `src/pages/Index.tsx`

Complete rewrite of the dashboard with these sections top-to-bottom:

1. **Greeting header** — "Good morning" / "Good afternoon" / "Good evening" based on `new Date().getHours()`. No username shown.

2. **Hero profit card** — Full-width card with dark green gradient background. Large green text showing this month's profit (revenue from `machine_sales` minus spend from `receipt_items`). Below it, two smaller numbers: "Revenue" and "Spend" in muted text.

3. **Two action buttons side-by-side** — Green filled "Upload Receipt" button (triggers same file upload + parse flow currently in Receipts page, reuse same logic inline) and an outlined "Log Sales" button. Upload Receipt opens the file picker and runs the upload/parse flow with progress bar inline on the dashboard. Log Sales opens a Drawer/Sheet bottom sheet.

4. **Log Sales bottom sheet** — Uses `Sheet` component (side="bottom"). First step: dropdown `Select` to pick a machine from user's `machines` table. Second step: date, cash, credit inputs + save button. Insert into `machine_sales`. No navigation away from dashboard.

5. **"Needs Attention" section** — Horizontal bar chart of bottom 8 SKUs by profit this month. Each bar shows SKU name and profit amount. Red/orange bars for negative or low profit. Uses simple CSS bars (no chart library needed).

6. **Compact stat row** — Three stats in a row: units purchased this month, avg profit margin this month, best machine this month (by revenue from `machine_sales`).

7. **Inline alerts** — Only render if `needsReviewCount > 0` or `needsPriceCount > 0`. Clean card with warning icon, tappable rows. Hidden entirely when both are zero.

8. **Remove** — Business Spend card, Personal Spend card, Top 5 SKUs section, old welcome message.

### Data fetching changes
- Switch from weekly to monthly time window (`startOfMonth` / `endOfMonth`)
- Fetch `machine_sales` for total revenue calculation
- Fetch all non-personal `receipt_items` this month for spend + SKU profit ranking
- Fetch `machines` list for the Log Sales dropdown and best machine stat
- Bottom 8 SKUs: same profit calc as before but sorted ascending, sliced to 8

### Part 2: Native mobile feel — global CSS + meta tag changes

**`index.html`** — Update viewport meta tag:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```

**`src/index.css`** — Add to base layer:
```css
* { touch-action: manipulation; }
html { -webkit-text-size-adjust: 100%; }
input, textarea, select { font-size: 16px; }
```

Add to scrollable containers utility:
```css
.scroll-touch { -webkit-overflow-scrolling: touch; }
```

### Files changed
- **Rewrite**: `src/pages/Index.tsx` — new dashboard layout + Log Sales sheet
- **Edit**: `index.html` — viewport meta tag
- **Edit**: `src/index.css` — touch/zoom prevention, 16px input font size

