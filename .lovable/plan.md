

## Remove seed SKUs, let users create all SKUs through Needs Review

The `seed-skus` edge function pre-populates ~30 SKUs on first login. This causes confusion because the AI parser tries to match receipt items against these pre-made SKUs (which don't align with actual receipt text). The intended flow is: upload receipt → all items land in Needs Review → user creates SKUs inline and maps them → future receipts auto-match.

### Changes

**1. `src/pages/Index.tsx`** — Remove the seed-skus call
- Delete lines 29-33 (the `useEffect` that invokes `seed-skus`)
- Keep the `user_settings` upsert logic (move it inline or to AuthContext if needed)

**2. `supabase/functions/seed-skus/index.ts`** — Delete this edge function entirely
- It's no longer needed since users create SKUs through the Needs Review flow

**3. Ensure `user_settings` is still created for new users**
- The seed-skus function also creates `user_settings`. Move that upsert into `Index.tsx` dashboard load (or a lightweight effect) so new users still get default settings.

**4. `supabase/functions/parse-receipt/index.ts`** — No changes needed
- The existing logic already handles the case where no SKUs/aliases exist: items simply get `needs_review = true`
- Historical matching from previously reviewed items continues to work

### Result
- New users start with zero SKUs
- First receipt upload → all items go to Needs Review
- User creates SKUs inline with sell price, maps items, approves
- Second receipt upload → previously reviewed items auto-match and skip review

