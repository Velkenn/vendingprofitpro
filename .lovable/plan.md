

## Auto-populate SKU search with item's raw name

When a user expands a Needs Review item, the SKU search field should automatically be filled with the item's `raw_name` so it either matches an existing SKU or is ready to become a new one.

### Changes

**`src/pages/NeedsReview.tsx`**

In the `openItem` function, set `skuSearch` to the item's `raw_name` (or `normalized_name` if present) instead of empty string. This will:
- Immediately filter the SKU dropdown to show relevant matches
- Pre-fill the "Create SKU" form name if the user clicks "Create"
- Save the user from having to type the product name manually

Change line in `openItem`:
```
setSkuSearch(item.normalized_name || item.raw_name);
```

Also update the "Create" button handler to use `skuSearch` as the default `sku_name` (already does this via `setNewSkuForm({ sku_name: skuSearch.trim(), ... })`).

