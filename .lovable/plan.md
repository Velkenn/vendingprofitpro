

## EMVending – Receipts & Profit

A mobile-first web app for tracking vending machine purchases from Sam's Club and Walmart receipts, with AI-powered PDF parsing and profitability analytics.

### Backend Setup (Lovable Cloud)
- **Auth**: Email/password authentication with multi-user support
- **Database**: Tables for receipts, receipt_items, skus, sku_aliases, user settings, and profiles
- **Storage**: Bucket for uploaded PDF receipts
- **Edge Functions**: AI-powered receipt parsing using Lovable AI (Gemini) with tool calling for structured extraction

### Data Model
- **receipts** – vendor, date, identifier (TC/Order#), location, totals, parse_status, pdf_url, user_id
- **receipt_items** – raw_name, normalized_name, qty, pack_size, unit_cost, line_total, is_personal, sku_id, user_id
- **skus** – sku_name, sell_price, category, rebuy_status, default_is_personal, user_id
- **sku_aliases** – vendor, raw_name_pattern, sku_id, pack_size_override
- **profiles** – user profile data linked to auth
- **user_settings** – week_start_day preference

### Receipt Upload & AI Parsing
- Upload PDF → store in Supabase Storage
- Edge function sends PDF content to Lovable AI with structured tool calling to extract:
  - Receipt type detection (Sam's Scan & Go, Walmart Store, Walmart Delivery)
  - Header data (vendor, date, TC/order number, location, totals)
  - Line items (name, qty, pack size, unit cost)
- Auto-detect partial parses when item count mismatches (PARTIAL_PARSE status)
- Fuzzy match extracted items against sku_aliases → auto-map or send to Needs Review

### Screens (11 total, mobile-first)

1. **Dashboard** – Business/personal spend (week/month), expected profit, top 5 SKUs, alert badges
2. **Receipts List** – Date, vendor, total, item count, parse status
3. **Receipt Detail** – Full line item table with inline editing, personal toggles, multi-select actions, approve & save
4. **SKU Master** – Searchable list with sell price, rebuy status, cost trends, supplier comparison
5. **Needs Review** – Queue for unmapped items, quick match/create SKU
6. **Needs Price** – SKUs missing sell_price, fast inline price entry
7. **Purchases** – Time-range tabs, grouped by SKU, filterable/sortable table
8. **Cost Trends** – Per-SKU price history with line charts
9. **Profit Leaderboard** – SKUs ranked by total profit, margin %, filterable by time
10. **Settings** – Week start day picker
11. **Report Export** – CSV export for receipts, items, and purchase summaries

### Profitability Engine
- Auto-calculate units (qty × pack_size), expected revenue, profit, margin
- Exclude personal items from all business analytics
- Track per-vendor costs for supplier comparison

### Seed Data
- Pre-populate ~30 SKUs with sell prices across Drinks, Food, and Candy/Snacks categories

### Key UX Principles
- Mobile-first with bottom navigation
- Upload → instant parsed results with correction UI
- Minimal taps for SKU mapping and price entry
- Multi-select batch actions for personal/business toggling

