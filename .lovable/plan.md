

## Delete all seeded SKUs

Create a temporary edge function that:

1. Finds all seeded SKUs (created before 2026-03-08) for user `fa141e07-5bd4-4bb0-a933-bab7ff5cfc53`
2. Unlinks any `receipt_items` pointing to those SKUs — sets `sku_id = NULL`, `needs_review = true`
3. Deletes any `sku_aliases` referencing those SKUs
4. Deletes the SKUs themselves
5. After running successfully, delete the edge function

**Files:**
- Create `supabase/functions/cleanup-seeded-skus/index.ts` — one-time cleanup function using service role key
- Update `supabase/config.toml` — add function config with `verify_jwt = false`
- After confirmed working, delete the function and remove config entry

