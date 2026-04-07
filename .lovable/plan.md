

## Simplify Chip: Raw Data with Time Limits, No Separate Intent Call

### Problem
Current approach uses summarized/aggregated data for broad queries (losing detail) and makes a separate AI API call for intent classification when regex doesn't match (adding cost and latency).

### Changes

**Edit: `supabase/functions/chip-chat/index.ts`**

**A. Remove the AI intent classification call entirely**
- Delete the `classifyIntent()` function (lines 148-222)
- Remove the `if (!regexIntent)` AI classifier branch and its usage logging (lines 563-574)
- When regex doesn't match, fall back to a default intent that fetches everything (same as current `defaultIntent`) — no API call needed
- The main model will handle understanding the question naturally from the data provided

**B. Apply time-based limits to data fetching in `fetchSelectiveContext()`**
- **Receipts**: Always filter to last 90 days (`receipt_date >= now() - 90 days`), unless a specific `date_filter` month is set
- **Receipt items**: Join with receipts to only fetch items from the last 90 days of receipts (fetch receipt IDs first, then filter items by those IDs)
- **Machine sales**: Always filter to last 6 months (`date >= now() - 6 months`), unless a specific `date_filter` is set
- **SKUs**: Fetch all (they're compact catalog data)
- **Memories**: Fetch all (already small)

**C. Remove the summarization layer**
- Delete the `summarizeForBroadQuery()` function (lines 291-375)
- Remove the `intent.broad ? summarizeForBroadQuery(rawCtx) : rawCtx` conditional (line 580)
- Always pass raw data directly to `buildSystemPrompt()`
- Remove all references to `receiptSummary`, `itemSummary`, `salesSummary` in `buildSystemPrompt()` — only keep the raw-data rendering paths

**D. Update `buildSystemPrompt()` to only use raw data sections**
- Remove the conditional branches that check for `ctx.receiptSummary`, `ctx.itemSummary`, `ctx.salesSummary`
- Keep the existing raw-data rendering logic (which already formats SKUs, items, receipts, machines, sales nicely)
- Add a note in the system prompt: "Data shown is from the last 90 days for purchases and 6 months for machine revenue"

### Expected Impact
- One fewer API call per message when regex doesn't match (saves ~$0.001-0.005 per message)
- Chip gets real row-level data for accurate answers instead of lossy summaries
- Token count stays manageable via 90-day/6-month time windows instead of aggregation
- Simpler code — removes ~150 lines of summarization logic

### Files changed
- **Edit**: `supabase/functions/chip-chat/index.ts` — remove `classifyIntent()`, remove `summarizeForBroadQuery()`, add time filters to data fetching

