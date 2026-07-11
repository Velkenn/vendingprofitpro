## Server-compute unit_cost in parse-receipt + recompute on render

### 1. `supabase/functions/parse-receipt/index.ts`
- Remove any wording in the AI system prompt (both PDF-text and image-vision paths) that tells the model to compute or return `unit_cost` / do division. Keep instructions for `qty`, `pack_size`, and `line_total` extraction only.
- After each item's final `qty` and `pack_size` are resolved — including alias/pack-size overrides and any values inherited from a previously reviewed item — always overwrite `unit_cost` with a server-computed value before insert:
  ```
  const effectivePack = pack_size && pack_size > 0 ? pack_size : 1;
  const denom = (qty || 1) * effectivePack;
  unit_cost = Math.round((line_total / denom) * 100) / 100;
  ```
- Apply to every `receipt_items` insert path in the function (main parse, CSV-style rows if any, fallback paths). Ignore whatever `unit_cost` the AI returned.

### 2. `src/pages/ReceiptDetail.tsx`
- In the line-items list, compute the displayed unit cost on render from the row's `qty`, `pack_size`, and `line_total` instead of reading the stored `unit_cost` column:
  ```
  const displayUnit = item.line_total / ((item.qty || 1) * (item.pack_size || 1));
  ```
  Render `$displayUnit.toFixed(2)`. No DB write — purely presentational so existing rows show the correct per-unit cost without re-saving.

### Notes
- No schema change. Existing rows keep their stored `unit_cost`; the render fix masks any stale values, and new inserts will be correct.
- Other surfaces that already derive unit cost from totals (SKU detail, stats) are unaffected.

### Files changed
- `supabase/functions/parse-receipt/index.ts`
- `src/pages/ReceiptDetail.tsx`
