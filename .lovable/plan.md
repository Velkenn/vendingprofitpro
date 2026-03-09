
## Simplify Settings Tab

### What's changing
The Settings page currently has a navigation menu with 6 links (Needs Review, Needs Price, Purchases, Cost Trends, Profit Leaderboard, Export Reports) plus the Week Start Day picker and a Sign Out button.

The request is to:
1. Remove the navigation menu items (all 6 links)
2. Keep Week Start Day picker
3. Replace the Export link with inline export buttons (Receipts, Receipt Items, SKUs CSVs) directly on the settings page — no separate /export route needed
4. Keep Sign Out button

### Changes needed

**`src/pages/SettingsPage.tsx`** — the only file that needs editing:
- Remove the `menuItems` array and the navigation card list
- Remove unused imports: `useNavigate`, `AlertTriangle`, `Tag`, `ShoppingCart`, `TrendingUp`, `Trophy`, `ChevronRight`
- Add the CSV download logic (copy from Export.tsx) and inline export section with three CSV buttons (Receipts, Receipt Items, SKUs)
- Keep Week Start Day section and Sign Out button

The `/export` route and `Export.tsx` file can remain as-is (they're registered in App.tsx and removing them would require touching App.tsx too — unnecessary risk for no UI benefit since the page will no longer be linked).

### Result
Settings page will show:
1. Export Data section with three CSV download buttons
2. Week Start Day picker
3. Sign Out button
