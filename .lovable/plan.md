

## Three Intelligence Layers for Chip

### Overview
Add anomaly detection, store-aware restocking, and enhanced restock warnings to Chip's edge function. Create a tracking table to prevent repeating alerts.

### 1. Database Migration

Create `restock_warnings_shown` table with `feature_type` column:
```sql
CREATE TABLE public.restock_warnings_shown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sku_id uuid,
  feature_type text NOT NULL DEFAULT 'restock',  -- 'restock' or 'anomaly'
  alert_key text,  -- for anomaly: machine_id or 'overall_revenue' or 'no_receipt'
  shown_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.restock_warnings_shown ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own warnings" ON public.restock_warnings_shown
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can select own warnings" ON public.restock_warnings_shown
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_restock_user_date ON public.restock_warnings_shown (user_id, shown_date, feature_type);
```

- `feature_type = 'restock'` for restock warnings (uses `sku_id`)
- `feature_type = 'anomaly'` for anomaly alerts (uses `alert_key` for identifying which anomaly: machine-specific, overall revenue, or no-receipt)

### 2. Edge Function Changes

**Edit: `supabase/functions/chip-chat/index.ts`**

**A. Anomaly Detection — `computeAnomalies()`**
- Takes `ctx.machines`, `ctx.sales`, `ctx.receipts`, plus supabase client and userId
- Calculates 4-week rolling average for each machine's weekly revenue and for total weekly revenue
- Flags any metric 20%+ above (📈) or below (⚠️) its rolling average
- Flags if no receipt uploaded in 10+ days (checks max `receipt_date` vs today)
- Flags any machine with no revenue logged in 10+ days (checks max sale `date` per machine)
- Checks `restock_warnings_shown` where `feature_type = 'anomaly'` and `shown_date = today` — skips already-shown alerts
- Returns formatted anomaly summary text (or empty string if nothing to show or already shown today)
- After computing, inserts records into `restock_warnings_shown` for each shown anomaly

**B. Store-Aware Restocking — `computeRestockWarnings()`**
- For each active SKU with 2+ purchases, calculate average days between purchases
- Predict next restock date = last purchase date + average interval
- Filter for items predicted to run out within 7 days
- For each warning SKU, find all stores where it was purchased by joining `receipt_items` → `receipts` (via receipt_id), grouping by store (`vendor` + `store_location`)
- For each store, get the most recent purchase's unit cost (`line_total / (qty * pack_size)`)
- Recommend the store with the lowest recent unit cost
- If the user last bought from a more expensive store, mention the savings
- Check `restock_warnings_shown` where `feature_type = 'restock'` and `shown_date = today` — skip already-shown SKUs
- Limit to top 3 most urgent (soonest predicted date)
- Insert shown records after computing
- Each warning includes: product name, last purchase date, avg interval (days), predicted next restock date, recommended store, price per unit at that store

**C. Intent Detection Update**
- Add `needs_restock: boolean` and `needs_anomaly: boolean` to Intent interface
- Restock intent triggers on: `restock|inventory|run out|running low|what.*(do|need).*this week|needs? attention|supply|stock up`
- When `needs_restock` is true, force `needs_skus`, `needs_receipts`, `needs_items` all true
- Anomaly detection runs on EVERY message (first of day only — checked via the table), appended after the AI response instruction in the system prompt

**D. System Prompt Integration**
- Always fetch machines + sales for anomaly detection (even if intent doesn't need them)
- If `computeAnomalies()` returns text, add a section: `## Anomaly Alerts (append after your answer)\n{anomalyText}\nAppend these alerts AFTER your main answer, separated by a blank line.`
- If `computeRestockWarnings()` returns text (only when restock intent), add: `## Restock Predictions\n{restockText}\nLead with the most urgent restock warning.`

### Expected Behavior
- First message of the day: Chip answers the question normally, then appends anomaly alerts if any metrics are off
- Subsequent messages same day: no anomaly alerts repeated
- Restock questions: Chip includes store recommendations with price comparisons
- Non-restock questions: no restock data fetched or shown

### Files changed
- **Migration**: Create `restock_warnings_shown` table with `feature_type` and `alert_key` columns
- **Edit**: `supabase/functions/chip-chat/index.ts` — add anomaly detection, store-aware restock logic, updated intent detection

