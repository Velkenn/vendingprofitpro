

## Add Delete Receipt Functionality

### What
Add a delete button on the Receipt Detail page with a confirmation dialog. Deleting a receipt will remove the receipt row and all associated `receipt_items` (cascade handled by DB, but we'll also delete the stored PDF from the storage bucket).

### Changes

**`src/pages/ReceiptDetail.tsx`**
- Import `AlertDialog` components and `Trash2` icon
- Add a `deleting` state and `handleDelete` function that:
  1. Deletes the PDF from the `receipts` storage bucket (if `receipt.pdf_url` exists)
  2. Deletes all `receipt_items` where `receipt_id = id`
  3. Deletes the receipt row itself
  4. Shows a success toast and navigates back to `/receipts`
- Add a red "Delete" button in the receipt header card (next to the badge)
- Wrap it in an `AlertDialog` confirmation: "Delete this receipt? This will permanently remove the receipt and all its line items."

No database migration needed — RLS already allows users to delete their own receipts and receipt_items.

