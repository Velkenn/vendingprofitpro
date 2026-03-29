

## Add Machines Tab with Full Feature Set

### Database Changes (3 new tables via migration)

**`machines`** — id (uuid PK), user_id (uuid, not null), name (text), location (text), created_at (timestamptz default now())

**`machine_sales`** — id (uuid PK), machine_id (uuid FK → machines.id on delete cascade), user_id (uuid, not null), date (date), cash_amount (numeric default 0), credit_amount (numeric default 0), created_at (timestamptz default now())

**`machine_skus`** — id (uuid PK), machine_id (uuid FK → machines.id on delete cascade), sku_id (uuid FK → skus.id on delete cascade), user_id (uuid, not null), created_at (timestamptz default now()), unique(machine_id, sku_id)

All three tables get RLS enabled with user_id-based policies for SELECT, INSERT, UPDATE, DELETE.

### New Files

1. **`src/pages/Machines.tsx`** — Main machines list page
   - Summary stats card at top: total cash, credit, revenue, estimated profit with week/month/year/lifetime toggle
   - Estimated profit = total revenue minus average cost of SKUs linked across all machines
   - List of machine cards showing name, location, this week's revenue
   - "Add Machine" button → dialog collecting name + location, inserts to `machines`

2. **`src/pages/MachineDetail.tsx`** — Machine detail page (route: `/machines/:id`)
   - Stats card: cash, credit, combined revenue, estimated profit with week/month/year/lifetime tabs + cash vs credit % split
   - Warning banner if no sales entry in past 7 days
   - "Log Sales" button → dialog collecting date, cash amount, credit amount → inserts to `machine_sales`
   - Sales history list: date, cash, credit, total per entry (chronological)
   - "Products in this Machine" section: shows linked SKUs from `machine_skus`, button to search/add existing SKUs, remove button per SKU
   - Export CSV button: downloads all sales entries as CSV (date, cash, credit, total, estimated profit)

### Edited Files

3. **`src/components/BottomNav.tsx`** — Add Machines tab between SKUs and More using a vending machine icon (e.g. `Monitor` or `Cpu` from lucide, or custom). Nav items become: Home, Receipts, Stats, SKUs, Machines, More (6 tabs).

4. **`src/App.tsx`** — Add routes `/machines` and `/machines/:id` inside the protected AppShell layout.

### Profit Calculation Logic
- For each machine, get linked SKUs via `machine_skus`
- For each SKU, look up average unit cost from `receipt_items` and `sell_price` from `skus`
- Estimated profit per machine = total machine revenue - (sum of avg_cost × estimated units sold across linked SKUs)
- Simple approach: profit margin % = (sell_price - avg_cost) / sell_price per SKU, then apply average margin to machine revenue

### Styling
- Same green/white theme, Card components, Badge components as existing pages
- Time filter toggle matches Stats page pattern

