

## Period Navigation + Machine Detail Fixes

### 1. Add period navigation arrows to Stats, Machines, and MachineDetail

Add a `periodOffset` state (default 0, negative = past) to all three pages. When Week/Month/Year is selected, show a row below the filter buttons with left/right chevron arrows and a label showing the period (e.g. "Mar 23–29, 2026" for week, "March 2026" for month, "2025" for year). Hidden for Lifetime and quarter filters.

**Files changed:** `src/pages/Stats.tsx`, `src/pages/Machines.tsx`, `src/pages/MachineDetail.tsx`

- Import `ChevronLeft`, `ChevronRight` from lucide and `subWeeks`, `subMonths`, `subYears`, `endOfWeek`, `endOfMonth`, `endOfYear` from date-fns
- Add `periodOffset` state, reset to 0 when `timeFilter` changes
- Update date range computation: shift start/end by offset using `subWeeks(now, -offset)` etc.
- Render navigation row: `‹  Mar 23–29, 2026  ›` with right arrow disabled at offset 0

### 2. Tappable sales entries with edit/delete dialog (MachineDetail)

**File:** `src/pages/MachineDetail.tsx`

- Add state for editing: `editSale` (the sale being edited or null), `editDate`, `editCash`, `editCredit`, `editSaving`
- Make each sales history row a clickable button that sets `editSale` and pre-fills the edit fields
- Add a new Dialog for editing with Save and Delete buttons
- Save calls `supabase.from("machine_sales").update(...)` filtered by sale id
- Delete calls `supabase.from("machine_sales").delete()` filtered by sale id
- Both refresh data and close dialog on success

### 3. Add Product modal loads all SKUs by default (MachineDetail)

**File:** `src/pages/MachineDetail.tsx`

- Change `handleSearchSkus` to fetch up to 100 SKUs (increase limit from 20)
- Load SKUs immediately when dialog opens (already does this via useEffect)
- Change `ScrollArea` to use `h-72` (fixed height) instead of `max-h-60` so it's always scrollable
- Search box stays, just filters the already-fetched list

### 4. Independent scrolling for Sales History and Products cards (MachineDetail)

**File:** `src/pages/MachineDetail.tsx`

- Sales History: wrap content in `ScrollArea` with `className="h-60"` (fixed height, always scrollable)
- Products in this Machine: wrap content in `ScrollArea` with `className="h-48"` (fixed height, always scrollable)
- Both already use or will use `ScrollArea`; just switch from `max-h-*` to fixed `h-*` so they get independent scroll containers

### Technical details

**Period label formatting:**
- Week: `format(weekStart, "MMM d") + "–" + format(weekEnd, "MMM d, yyyy")`
- Month: `format(monthStart, "MMMM yyyy")`
- Year: `format(yearStart, "yyyy")`

**Date range with offset (shared pattern):**
```typescript
const [periodOffset, setPeriodOffset] = useState(0);
// Reset on filter change
useEffect(() => setPeriodOffset(0), [timeFilter]);

function getFilterRange(filter, offset) {
  const now = new Date();
  if (filter === "week") {
    const base = subWeeks(startOfWeek(now), -offset);
    return { start: base, end: endOfWeek(base) };
  }
  // similar for month/year
}
```

**Edit sale dialog fields:** reuses same Input components as the Log Sale dialog, plus a red Delete button in the footer.

