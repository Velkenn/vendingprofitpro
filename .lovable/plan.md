

## Fix Avg Unit Cost Calculation and Revenue-Based Profit

### Problem 1: Avg Unit Cost is wrong
The current calculation on line 176-179 computes `total_cost = unit_cost * units` then divides by total units. This is unreliable because `unit_cost` can be null/0 or inconsistent with `line_total`. The correct approach (already used in SKU stats on line 161) is simply `total_spend / total_units` — divide what you actually paid by how many units you got.

**Fix in `src/pages/Stats.tsx`:**
- Change `avg_unit_cost` in `calculateBusinessMetrics` to use `total_spend / total_units` instead of `total_cost / total_units`
- Remove the separate `total_cost` accumulator since it's no longer needed

### Problem 2: Profit should use actual machine sales revenue
Now that users log actual sales via Machines, profit should be: **total machine revenue (cash + credit) minus total spend on purchases** — not the old sell_price-based estimate.

**Changes in `src/pages/Stats.tsx`:**
- Fetch all `machine_sales` for the user on mount (same pattern as receipt_items fetch)
- Filter machine_sales by the same time range as receipt_items
- Calculate total revenue = sum of `cash_amount + credit_amount` from filtered machine_sales
- Profit = total revenue - total spend
- Update the "Total Profit" card to show this actual profit
- Add a "Total Revenue" card (replace or supplement existing cards) showing machine revenue
- Update the SKU-level `profit_per_unit` to still use sell_price since that's per-SKU, but the top-level "Total Profit" uses real revenue

### Summary of changes
- **`src/pages/Stats.tsx`**: Fix avg_unit_cost formula, fetch machine_sales, compute profit as revenue minus spend

