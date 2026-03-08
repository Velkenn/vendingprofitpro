

## Auto-complete SKU category from existing categories

When creating a new SKU in the Needs Review flow, auto-suggest from the user's existing categories.

### Changes

**`src/pages/NeedsReview.tsx`**

1. Extract unique categories from the already-loaded `skus` array: `const categories = [...new Set(skus.map(s => s.category).filter(Boolean))]`

2. Compute the most common category and pre-fill `newSkuForm.category` with it when opening the create SKU form (in the `setNewSkuForm` call inside the "Create" button handler).

3. Replace the plain category `<Input>` with an input that shows a filtered dropdown of existing categories (same pattern as the SKU search dropdown already in this file). User can still type a new category or pick from the list.

