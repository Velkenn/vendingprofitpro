

## Fix AI Parsing and Add Progress Bar

### Problems identified

1. **Google Gemini API rejects the tool schema** — The edge function logs show: `Unknown name "additionalProperties"`. Google's function calling API doesn't support `additionalProperties` in the schema. Lines 41 and 46 of `parse-receipt/index.ts` include `additionalProperties: false` which breaks Google. The same schema is passed to Anthropic via `input_schema` (line 483) — Anthropic also doesn't use this field.

2. **No progress bar during parsing** — The upload UI just shows a spinner with "This usually takes 10-20 seconds".

### Changes

**File: `supabase/functions/parse-receipt/index.ts`**

- Remove `additionalProperties: false` from both the item schema (line 41) and the top-level parameters (line 46) in `EXTRACT_TOOL`. This fixes the Google 400 error. OpenAI tolerates its absence, and Anthropic doesn't use it either.
- For the Google provider call (line 537-541), strip `additionalProperties` from a cloned schema before sending, as a safety net.

**File: `src/pages/Receipts.tsx`**

Replace the "parsing" state UI (lines 189-197) with an animated progress bar:
- Add state: `parseProgress` number (0-100)
- When entering "parsing" state, start a simulated progress animation:
  - 0→30% fast (first 3s) — "Uploading complete"
  - 30→60% medium (next 5s) — "Extracting text..."  
  - 60→85% slow (next 10s) — "Analyzing items..."
  - 85→95% very slow (next 15s) — "Almost done..."
  - Stays at 95% until polling resolves
- When state changes to "done", jump to 100%
- Use the existing `Progress` component from `@/components/ui/progress`
- Show the current step label below the progress bar

### Result
- Google/Anthropic/OpenAI parsing will all work without schema errors
- Users see a smooth progress bar instead of a static "10-20 seconds" message

