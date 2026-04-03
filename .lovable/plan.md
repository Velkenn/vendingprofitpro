

## Fix Negative Receipt Profits — Missing pack_size in Revenue Calculation

### Problem
In `src/pages/Receipts.tsx` line 66-77, the estimated profit query doesn't fetch `pack_size` from `receipt_items`, and the revenue calculation only multiplies `sell_price × qty` instead of `sell_price × qty × pack_size`.

Example: A box of 48 Snickers (sell_price $2.00, line_total $52.48):
- **Current (wrong)**: revenue = $2.00 × 1 = $2.00, profit = $2.00 - $52.48 = **-$50.48**
- **Correct**: revenue = $2.00 × 1 × 48 = $96.00, profit = $96.00 - $52.48 = **+$43.52**

### Fix (single file: `src/pages/Receipts.tsx`)

1. **Add `pack_size` to the select query** (line 65):
   - Change: `"receipt_id, qty, sku_id, is_personal, skus(sell_price)"`
   - To: `"receipt_id, qty, pack_size, sku_id, is_personal, skus(sell_price)"`

2. **Include pack_size in revenue calculation** (line 77):
   - Change: `prev + Number(sellPrice) * item.qty`
   - To: `prev + Number(sellPrice) * (item.qty || 1) * ((item as any).pack_size || 1)`

Two lines changed, one file.

