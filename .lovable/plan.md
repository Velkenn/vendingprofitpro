

## Fix Receipt Parsing: Use AI as Primary Parser

### Problem
The regex parser is matching only 1 item per receipt and declaring success, which prevents the AI fallback from ever running. The logs show "Regex parser succeeded: 1 items found" on a receipt with $92.90 and many items. The regex patterns don't reliably match the PDF text layout from pdfjs extraction.

### Root cause
The regex patterns expect specific column spacing (e.g. `\s{2,}` between fields) that rarely matches the actual extracted text. When it accidentally matches one line, it returns 1 item and the code treats that as success — never falling back to AI.

### Solution
Since the user has configured their own AI provider, **use AI as the primary parser** and remove the regex-first approach. The regex was only added as a cost-saving measure for Lovable AI credits, which is no longer relevant.

### Changes

**File: `supabase/functions/parse-receipt/index.ts`**

In the Phase 2 section (lines 637-688), change the logic to:
1. Look up the user's AI config first
2. If an AI provider is configured, use it directly (skip regex)
3. If no AI provider is configured, fall back to regex as a best-effort parser
4. Keep all the regex parser functions in the file as the no-AI fallback

This is a ~15 line change to the orchestration logic in the main handler. No other files change.

### Result
- Receipts will be fully parsed by the user's chosen AI model
- All items will be extracted reliably
- Regex still available as fallback if no AI key is configured

