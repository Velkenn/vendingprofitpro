

## Use AI-First Parsing for Any Receipt

### Problem
1. Regex parser runs first and "succeeds" with 1 item, preventing AI from running
2. System prompt and schema are hardcoded to only Walmart/Sam's Club receipt types
3. The `vendor` field on receipt insert is hardcoded to `"sams"`

### Changes

**File: `supabase/functions/parse-receipt/index.ts`**

1. **Update `EXTRACT_TOOL` schema** (lines 18-19):
   - Change `vendor` enum from `["sams", "walmart"]` to a free-text string with description "Store name, e.g. Sam's Club, Walmart, Costco, Target"
   - Change `receipt_type` from enum to free-text string with description "e.g. in_store, delivery, scan_and_go"

2. **Update `SYSTEM_PROMPT`** (lines 421-435):
   - Remove Walmart/Sam's-specific instructions
   - Make it generic: "Parse receipts from any store. Extract ALL line items with their names, quantities, and prices."

3. **Reverse Phase 2 logic** (lines 637-688):
   - Look up user's AI config first
   - If AI is configured, use AI directly as primary parser (skip regex entirely)
   - If no AI configured, fall back to regex as best-effort
   - This ensures the user's AI always runs when available

4. **Update receipt header update** (lines 712-723):
   - Handle non-sams/walmart vendors gracefully — store the vendor string from AI response
   - Since the `vendor` column is an enum (`sams`/`walmart`), default to `"sams"` for unknown vendors but store the actual vendor name in `store_location` if it doesn't match known enums

**File: `src/pages/Receipts.tsx`**

5. **Update upload insert** (line ~101):
   - Change hardcoded `vendor: "sams"` to `vendor: "sams"` (keep as default since it's required by enum, AI will update it)
   - Update the file accept to also allow images: `accept=".pdf,image/*"`

6. **Update empty state text** (line ~218):
   - Change "Sam's Club or Walmart" to "Any store receipt"

### Result
- AI always runs first when configured, extracting all items reliably
- Regex only used as fallback when no AI key is set
- Any store's receipt can be parsed, not just Walmart/Sam's Club

