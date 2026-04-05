

## Remove All Data Caps from Chip's System Prompt

### Problem
There are three caps limiting Chip's data access:
1. **Receipts**: `ctx.receipts.slice(0, 200)` on line 66 — only shows 200 most recent receipts
2. **Machine sales**: `.slice(0, 200)` on line 93 — only 200 sales per machine
3. **Supabase default limit**: All queries return max 1000 rows by default (no `.range()` or pagination)

### Fix (`supabase/functions/chip-chat/index.ts`)

**1. Remove `.slice()` caps** — delete the `slice(0, 200)` on receipts (line 66) and machine sales (line 93). Show all data in the prompt.

**2. Paginate large tables past the 1000-row Supabase limit** — for `receipts`, `receipt_items`, and `machine_sales`, implement a fetch loop that pages through all rows using `.range(offset, offset+999)` until no more rows are returned. SKUs, machines, and memories are unlikely to exceed 1000 rows but can use the same pattern for safety.

**3. Update the prompt header** — change "showing most recent 200" to show the actual total count.

**4. Add purchase detail section** — include the date-enriched item list (from the previously approved but unimplemented plan) so Chip can answer "how many X did I buy in February" by cross-referencing items with receipt dates. No artificial cap.

### Trade-off
More data in the prompt means higher token usage and cost per message. For users with very large datasets (thousands of receipts), prompts could get large. This is acceptable since the user explicitly wants full database access.

### Files changed
- **Edit**: `supabase/functions/chip-chat/index.ts` — remove slice caps, add pagination for all queries, add purchase detail section with dates

