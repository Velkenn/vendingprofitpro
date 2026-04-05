

## Give Chip Individual Machine Sales Data

### Problem
Line 90-94 of `chip-chat/index.ts` collapses all machine sales into a single total per machine. Chip only sees "Machine X: 15 sales logged, total revenue $500" — no per-date breakdown. So when asked "how much did each machine make this week?" Chip can't answer.

### Fix (single file: `supabase/functions/chip-chat/index.ts`)

**Replace the `machineSummary` block** (lines 90-94) to include individual sales entries per machine:

- For each machine, list every sale entry with date, cash, credit, and total
- Cap to most recent 200 sales entries total to avoid prompt bloat
- Format like:
```
- Machine A (Location):
  - 2026-03-31: cash $45.00, credit $32.00, total $77.00
  - 2026-03-24: cash $50.00, credit $28.00, total $78.00
  ...
  Summary: 10 entries, total revenue $750.00
```

This gives Chip the granular date-level data needed to answer weekly, monthly, or comparative questions per machine.

### Files changed
- **Edit**: `supabase/functions/chip-chat/index.ts` — expand `machineSummary` to include per-date sales breakdown

