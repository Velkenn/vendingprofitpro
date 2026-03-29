

## Add Navigation for Past Weeks/Months/Years on Stats and Machines Tabs

### Problem
Currently "Week" shows only the current week, "Month" only the current month, and "Year" only the current year. Users cannot navigate to previous periods (e.g. last week, two months ago).

### Solution
Add left/right arrow buttons flanking the time filter so users can step backward and forward through periods. When a relative filter (Week/Month/Year) is selected, show the period label (e.g. "Mar 23–29, 2026") with `‹` and `›` arrows to navigate. The right arrow is disabled when viewing the current period.

### Changes

**File: `src/pages/Stats.tsx`**

1. Add a `periodOffset` state (number, default 0; negative = past periods)
2. Reset `periodOffset` to 0 when `timeFilter` changes
3. Update `getFilteredItems` to shift the date window by `periodOffset` weeks/months/years using `subWeeks`, `subMonths`, `subYears` from date-fns
4. Render a navigation row below the filter buttons: `‹ [period label] ›`
   - Label shows the date range (e.g. "Mar 23–29" for week, "March 2026" for month, "2025" for year)
   - Left arrow decrements offset, right arrow increments (capped at 0)
   - Hidden when filter is "lifetime" or a quarter

**File: `src/pages/Machines.tsx`**

1. Same pattern: add `periodOffset` state, reset on filter change
2. Update `getFilterStart` to accept an offset and compute the shifted start/end dates
3. Add the same `‹ [period label] ›` navigation row below the filter buttons
4. Hidden when filter is "lifetime"

**File: `src/pages/MachineDetail.tsx`**

Same changes as Machines.tsx — add period offset navigation to the detail page's time filter.

### UI Layout
```text
[ Week ] [ Month ] [ Year ] [ Lifetime ]
      ‹  Mar 23–29, 2026  ›
```
Arrows are small icon buttons using `ChevronLeft` / `ChevronRight` from lucide. The label is centered between them.

