

## Add Edit & Delete to SKUs page

The user wants to manage SKUs from the SKU Master page, including the ability to edit and delete. I'll also need to understand which specific SKUs the user wants deleted (they can do this via the new UI).

### Changes

**`src/pages/SKUs.tsx`**

1. Add edit/delete buttons to each SKU card (using Edit2 and Trash2 icons)
2. Add edit mode that expands inline (similar to NeedsReview pattern) with fields for:
   - SKU Name
   - Sell Price
   - Category (with autocomplete from existing categories)
   - Rebuy Status (dropdown: Rebuy, Test, Do Not Rebuy)
   - Default Is Personal (switch)
3. Add delete confirmation dialog (AlertDialog) to prevent accidental deletions
4. On delete: cascade-handle by setting linked receipt_items to `sku_id = null` and `needs_review = true`
5. Refresh state after edits/deletes

### Flow
- Each SKU card gets Edit and Delete icon buttons on the right
- Edit button expands the card inline with form fields
- Delete shows AlertDialog confirmation, then removes the SKU and unlinks any receipt_items

