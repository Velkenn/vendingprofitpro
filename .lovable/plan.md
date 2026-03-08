

## Friendlier Receipt Status Presentation

Right now the UI shows raw enum values like `PARSED`, `PARTIAL_PARSE`, `PENDING`, and `FAILED` — these are developer-facing labels that don't mean much to users. The upload flow also navigates to the detail page immediately while parsing is still running, showing an empty state with no feedback.

### Changes

**1. Human-readable status labels + icons** (across all pages that show status)

| Internal status | Display label | Icon | Color |
|---|---|---|---|
| `PENDING` | "Processing..." | spinning loader | muted/blue |
| `PARSED` | "Complete" | check-circle | green |
| `PARTIAL_PARSE` | "Needs attention" | alert-triangle | amber/orange |
| `FAILED` | "Failed" | x-circle | red |

Create a small helper `src/lib/receipt-status.ts` that maps status → `{ label, icon, colorClass }` so it's consistent everywhere.

**2. Upload page — progress feedback** (`src/pages/Upload.tsx`)

After triggering the parse, instead of immediately navigating away, show an inline progress state:
- Animated spinner with "Analyzing your receipt..."
- On completion (poll the receipt row every 2s or use realtime), show a success summary: "Found 10 items · $127.43 total" with a "View Receipt" button
- On failure, show the error inline with a "Try Again" option

**3. Receipt detail — friendlier partial-parse banner** (`src/pages/ReceiptDetail.tsx`)

Replace the current misleading "X of Y items extracted" (which confuses line items vs quantities) with:
- "All items extracted" (green) when `PARSED`
- "Review recommended — some items may need corrections" (amber) when `PARTIAL_PARSE`, with a link to the Needs Review queue
- Remove the item_count comparison entirely since it's unreliable

**4. Receipts list — cleaner badges** (`src/pages/Receipts.tsx`)

- Replace raw enum badges with the human-readable labels from the helper
- For `PENDING`, show a small animated dot or spinner instead of a static badge
- Add item count subtitle: e.g. "10 items" under the date

### Files to create/edit

- **Create** `src/lib/receipt-status.ts` — status mapping helper
- **Edit** `src/pages/Upload.tsx` — post-upload polling + inline progress
- **Edit** `src/pages/Receipts.tsx` — friendly labels, item count, pending animation
- **Edit** `src/pages/ReceiptDetail.tsx` — replace misleading banner, use friendly status

