

## Remove category auto-population in Needs Review

The user wants the category field to start empty when creating a new SKU, rather than pre-filling with the most common category. Users should be able to type a new category or select from the dropdown of existing categories.

### Changes

**`src/pages/NeedsReview.tsx`**

In the "Create" button handler (lines 237-238), change the category initialization from `mostCommonCategory` to empty string:

```typescript
setNewSkuForm({ sku_name: skuSearch.trim(), sell_price: "", category: "" });
setCategorySearch("");
```

This will leave the category field blank by default while preserving the dropdown functionality for selecting existing categories or typing new ones.

