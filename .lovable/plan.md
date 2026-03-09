

## Make Needs Review Items Interactive

Currently the Needs Review page is read-only -- items are displayed but cannot be tapped or edited. The purpose of this queue is to let users resolve items that need SKU mapping or corrections.

### Changes

**`src/pages/NeedsReview.tsx`** -- Full rework to make each item actionable:

1. **Tappable cards** -- Each item card becomes clickable, expanding an inline edit form (or navigating to the parent receipt detail).

2. **Inline resolution form** per item with:
   - **Normalized name** -- editable text field (pre-filled with `raw_name`)
   - **SKU mapping** -- a searchable dropdown of existing SKUs from the `skus` table. Selecting one sets `sku_id` on the item.
   - **Mark as personal** toggle (`is_personal`)
   - **Qty / Pack size / Line total** -- editable fields
   - **"Approve" button** -- saves changes, sets `needs_review = false`, removes item from the list
   - **"Skip" button** -- collapse without saving

3. **Fetch SKUs** on mount for the dropdown options (query `skus` table ordered by `sku_name`).

4. **On approve**: Update the `receipt_items` row with edited fields + `needs_review: false`, then remove it from the local list with a toast confirmation.

5. **Count badge** in the header showing total items remaining.

This keeps the workflow minimal-tap: open page, tap item, pick SKU or edit name, hit Approve -- done.

