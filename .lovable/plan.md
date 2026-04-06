

## Optimize Chip: Smart Data Retrieval + Flash-Lite Default + Filter Failed SKUs

### Overview
Three changes: (1) add Gemini 2.5 Flash-Lite as a model option and make it Chip's default, (2) replace the "fetch everything" approach with intent-based selective querying, (3) exclude Failed/Do Not Rebuy SKUs from advice.

### 1. Add Flash-Lite to AI Settings

**Edit: `src/components/settings/AISettingsDialog.tsx`**
- Add `"gemini-2.5-flash-lite"` to the Google provider's models array (line 61)

**Edit: `supabase/functions/ai-settings/index.ts`**
- Add `"gemini-2.5-flash-lite"` to the `PROVIDER_MODELS.google` array

### 2. Set Flash-Lite as Chip's Default Model

**Edit: `supabase/functions/chip-chat/index.ts`** (line 50)
- Change the Lovable fallback model from `"google/gemini-3-flash-preview"` to `"google/gemini-2.5-flash-lite"`

### 3. Smart Intent-Based Data Retrieval

**Edit: `supabase/functions/chip-chat/index.ts`**

Replace the current flow (fetch all data → build prompt → call AI) with a two-step approach:

**Step A — Classify the question's intent** using a cheap, fast call to Flash-Lite via the Lovable gateway. Send the user's latest message with a small system prompt asking it to return a JSON object like:
```json
{
  "needs_skus": true,
  "needs_receipts": false,
  "needs_items": false,
  "needs_machines": true,
  "needs_sales": true,
  "date_filter": "2026-03",
  "broad": false
}
```

Use tool calling / structured output to guarantee JSON. This is a ~20 token input, ~30 token output call — negligible cost.

**Step B — Selective fetch** based on the intent flags:
- Only query the tables flagged as `true`
- If `date_filter` is present, add `.gte("receipt_date", startDate).lte("receipt_date", endDate)` on receipts, or `.gte("date", ...)` on machine_sales
- If `broad` is true, fetch everything (current behavior)
- Always fetch `chip_memories` (tiny table, always relevant)

**Step C — Build a trimmed system prompt** that only includes sections for the data actually fetched. Empty sections are omitted entirely.

### 4. Exclude Failed SKUs from Advice

**Edit: `supabase/functions/chip-chat/index.ts`** — `buildSystemPrompt`

- Filter out SKUs with `rebuy_status === 'Failed'` from the SKU summary and profit analysis sections
- Add a line to the system prompt: "SKUs marked as Failed or Do Not Rebuy have been excluded. Do not recommend or analyze them — the user has already moved on from those products."

### 5. Deploy

Deploy the updated `chip-chat` and `ai-settings` edge functions.

### Technical Details

**Intent classification prompt** (sent to `google/gemini-2.5-flash-lite` via Lovable gateway):
```
Analyze this vending business question and return JSON indicating which data tables are needed.
Tables: skus (product catalog), receipts (purchase records), items (line items on receipts), machines (vending machines), sales (machine revenue by date).
Set date_filter to a YYYY-MM string if the question mentions a specific month/period.
Set broad=true only if the question asks for a comprehensive overview.
```

**Fallback**: If the intent classification fails (network error, parse error), fall back to fetching all data (current behavior) so the feature degrades gracefully.

### Files changed
- **Edit**: `supabase/functions/chip-chat/index.ts` — intent classification, selective fetch, exclude Failed SKUs, default model change
- **Edit**: `supabase/functions/ai-settings/index.ts` — add flash-lite to allowed models
- **Edit**: `src/components/settings/AISettingsDialog.tsx` — add flash-lite to UI model list

