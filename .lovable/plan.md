## 1. Parse-receipt: Lovable AI fallback + "other" vendor default

**`supabase/functions/parse-receipt/index.ts`**
- When `getUserAIConfig()` returns null, build a synthetic config that routes through the Lovable AI gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) using `LOVABLE_API_KEY` and model `google/gemini-2.5-flash`. Applies to both the PDF text path and the image vision path.
- Remove the "Check your API key in Settings" / "configure a provider in Settings" error branches. Only surface real errors (invalid file, upstream 5xx after retries).
- Update the FAILED status message to a generic "Could not read this receipt. Try a clearer scan." — no Sam's / Walmart mention.
- Auto-personal: when a parsed item matches a SKU with `default_is_personal = true`, set the item's `is_personal = true` and `needs_review = false`.

**Vendor default**: In `src/pages/Index.tsx` (line 228) and any other insert of a new receipt (Chat upload, Receipts page upload), change `vendor: "sams"` → `vendor: "other"`. Parse-receipt already re-maps vendor from parsed text, so no downstream regression.

## 2. Receipts list shows store name, not vendor enum

- `src/pages/Receipts.tsx` and receipt card components: display `store_location` (short form via existing helper) as the primary label; fall back to vendor label only when `store_location` is null.

## 3. Dashboard rebuild (`src/pages/Index.tsx`)

- **Polling timeout**: add a 90s watchdog to `pollReceipt`. On timeout: stop polling, set error state with message "This is taking longer than expected — check the Receipts tab" and a Retry button.
- **Capture invoke result**: `await supabase.functions.invoke(...)`; if `error` is returned, immediately transition to error state so the 95% progress bar can't hang.
- **Layout / spacing**: tighten `space-y-5` → `space-y-4`; move the Upload Receipt / Log Sales grid directly under the hero profit card (before month nav is fine — order: greeting, month nav, hero card, action buttons, then everything else).
- **Top Movers card** (replaces Needs Attention): scrollable card showing the 5 lowest and 3 highest profit SKUs this month. Subtle caption per row: "Est. profit if all units sell".
- **Consolidated summary card**: combine the three tiny stat boxes (units, margin, best machine) and the alerts (needs review / needs price) into one card with `text-sm` (≥12px) rows.
- **First-run empty state**: when the user has no machines AND no receipts AND no Chip messages, render a checklist card instead of the dashboard body:
  1. Add a machine → `/app/machines`
  2. Upload your first receipt → triggers file picker
  3. Ask Chip a question → `/app/chat`
  Each step auto-checks based on live counts (machines > 0, receipts > 0, chip_memories or a message row > 0).

## 4. Needs Review one-tap rebuild (`src/pages/NeedsReview.tsx`)

- New compact card layout (no expand-on-tap by default):
  - Read-only summary line: guessed name, qty, pack size, line total.
  - Inline `sell_price` input pre-filled from the matched SKU's `sell_price` if present.
  - Buttons side-by-side: **Approve** (primary) and **Personal** (secondary).
  - Small `Edit` link → opens the current full form for name/SKU/qty corrections.
- **Approve** action: saves item as-is, sets `needs_review = false`; if `sell_price` field was entered and the linked SKU's `sell_price` is null or differs, update the SKU.
- **Personal** action: sets item `is_personal = true`, `needs_review = false`, no price required; also updates the linked SKU's `default_is_personal = true`.
- **Sticky "Approve All"** at top: single confirm dialog, then bulk-approve remaining items with their currently-displayed values.

## 5. Personal SKU handling app-wide

- `default_is_personal = true` on a SKU excludes it from:
  - `src/pages/SKUs.tsx` default view (add "Show personal" toggle to include them).
  - `Needs Price` count query in `Index.tsx` (already filters — keep) and the `NeedsPrice` page list.
  - Profit / stats calculations (Stats, Top Movers, ProfitLeaderboard): filter items joined to personal SKUs out.
- Parse-receipt auto-personal (covered in §1) prevents personal items from re-entering review.

## Technical notes

- Lovable AI gateway call shape reused from `chip-chat`; wrap in the same 500/503 retry-with-backoff already present in parse-receipt.
- No database migrations required — `default_is_personal` and `is_personal` already exist. No changes to `restock_warnings_shown`.
- `store_location` short-name helper already exists (used by SKU detail modal); reuse it.

## Files changed

- `supabase/functions/parse-receipt/index.ts`
- `src/pages/Index.tsx`
- `src/pages/Receipts.tsx` (+ any receipt card component)
- `src/pages/NeedsReview.tsx`
- `src/pages/SKUs.tsx`
- `src/pages/Stats.tsx`, `src/pages/ProfitLeaderboard.tsx` (personal-SKU exclusion)
- Chat upload path (`src/pages/Chat.tsx`) if it inserts receipts directly — switch vendor default to `"other"`
