

## Sort SKU Purchase History Chronologically

### Problem
The purchase history in the SKU detail modal is ordered by `created_at` (when the record was imported), not by the actual receipt date. This means entries appear in import order rather than chronological order.

### Fix

**Edit: `src/components/sku/SKUDetailModal.tsx`**

After building the `entries` array (around line 100), sort it by date descending (most recent first) before setting state:

```ts
entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
```

This ensures both the Purchase History and Profit Breakdown sections display in proper chronological order since they both iterate over the same `purchases` array.

### Files changed
- **Edit**: `src/components/sku/SKUDetailModal.tsx` — add client-side sort by receipt date descending

