

## Reduce Chip's API Cost

### Problem
Three factors compound to make each Chip message expensive:
1. Entire database serialized as text in system prompt (biggest cost)
2. Two API calls per message (intent classification + response)
3. Full conversation history resent each time, multiplying the prompt size

### Proposed Optimizations

**A. Pre-aggregate data server-side instead of dumping raw rows**

Instead of sending every individual receipt line item and sale entry as text, compute summaries in the edge function before building the prompt:

- **SKUs**: Keep as-is (compact, needed for context)
- **Items**: Replace raw line-item dump with per-SKU aggregates: `SKU Name: 45 units across 8 purchases, avg cost $0.82/unit, last bought 2026-03-15`
- **Receipts**: Replace individual receipt lines with monthly summaries: `March 2026: 12 receipts, $847 total, top vendors: Sam's Club (7), Costco (5)`
- **Sales**: Replace per-date entries with weekly/monthly aggregates per machine: `Machine A - March 2026: $520 revenue (cash $310, credit $210), 4 weeks logged`
- **Only include raw detail when the intent is narrow** (specific date, specific SKU, specific machine) — for broad questions, use summaries only

This could reduce prompt size by 80-90% for users with large datasets while preserving the information Chip needs.

**B. Cache intent classification for similar questions**

Skip the classification API call when the question clearly matches a simple pattern (regex-based):
- Contains "machine" or "revenue" → needs_machines + needs_sales
- Contains "SKU" or "product" or "profit" → needs_skus + needs_items
- Contains specific month name → set date_filter
- Only call the AI classifier for ambiguous questions

This eliminates the second API call ~70% of the time.

**C. Limit conversation history in the API call**

Instead of sending all messages, only send the last 6 messages (3 exchanges) plus the system prompt. Older context rarely matters and dramatically inflates token count on longer conversations.

### Implementation

**Edit: `supabase/functions/chip-chat/index.ts`**

1. Add a `summarizeContext()` function that takes the raw fetched data and produces aggregated summaries instead of row-by-row text
2. In `buildSystemPrompt`, use summaries for broad queries and raw detail only for narrow/filtered queries
3. Add regex-based intent shortcutting before the AI classification call
4. Trim `messages` array to last 6 entries before sending to AI

### Expected Impact
- **Broad questions**: ~80-90% fewer input tokens (summaries vs raw rows)
- **Narrow questions**: Similar cost (already filtered by intent + date)
- **Classification**: ~70% of messages skip the classification API call entirely
- **Long conversations**: Constant cost after 3 exchanges instead of linear growth

### Files changed
- **Edit**: `supabase/functions/chip-chat/index.ts` — add summarization, regex intent shortcuts, conversation trimming

