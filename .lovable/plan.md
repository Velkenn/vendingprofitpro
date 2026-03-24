

## Add Quarterly Tax Filters and Store Spend Breakdown

### Changes needed

**File: `src/pages/Stats.tsx`** — single file edit

#### 1. Add quarterly time filter options
- Expand `TimeFilter` type to include `"q1" | "q2" | "q3" | "q4"`
- Add a second row of filter buttons below the existing Week/Month/Year/Lifetime tabs for the quarters: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
- These will use the current year's quarter date ranges
- Update `getFilteredItems` to handle quarter filters by computing start/end dates for each quarter of the current year

#### 2. Add Store Spend Breakdown card
- Need to also fetch `vendor` (and optionally `store_location`) from the `receipts` join — currently only fetching `receipt_date`
- Update the query select to include `receipts!inner(receipt_date, vendor, store_location)`
- Update the `ReceiptItemWithJoins` type to include `vendor` and `store_location`
- Add a new function `calculateStoreSpend` that groups filtered items by vendor (or store_location if available), sums `line_total`, and calculates each store's percentage of total spend
- Render a new "Spend by Store" card below the SKU Performance card showing each store with its total and percentage

#### 3. Quarter filter UI approach
- Use a second `TabsList`-style row or a set of toggle buttons beneath the existing time filter tabs
- Labels: "Q1 Jan-Mar", "Q2 Apr-Jun", "Q3 Jul-Sep", "Q4 Oct-Dec"
- Selecting a quarter deselects the week/month/year/lifetime filter and vice versa

### Result
- Users can filter stats by tax quarters for sales tax reporting
- New card shows spend breakdown per store (Sam's, Walmart) with dollar amounts and percentages

