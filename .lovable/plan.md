

## Admin Panel with API Usage Tracking

### Overview
Create a usage-tracking system that logs every AI API call across the app, and build an admin-only panel to visualize costs. Only `sdodd987@gmail.com` can access it.

### 1. Database Migration

Create `api_usage_logs` table:
```sql
CREATE TABLE public.api_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature_type text NOT NULL,        -- 'chip_chat', 'chip_intent', 'receipt_parse', 'receipt_normalize'
  model_used text NOT NULL,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  estimated_cost_usd numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Only the owner can read all logs
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (SELECT email FROM auth.users WHERE id = auth.uid()) = 'sdodd987@gmail.com'
$$;

CREATE POLICY "Admin can view all logs"
  ON public.api_usage_logs FOR SELECT
  TO authenticated
  USING (public.is_admin_user());

-- Edge functions insert via service role, so no INSERT policy needed for users
-- But add one so the service role key works through RLS:
CREATE POLICY "Service insert"
  ON public.api_usage_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_api_usage_logs_created ON public.api_usage_logs (created_at DESC);
CREATE INDEX idx_api_usage_logs_feature ON public.api_usage_logs (feature_type);
```

### 2. Edge Function Logging

**Edit: `supabase/functions/chip-chat/index.ts`**

Add a `logUsage` helper that inserts into `api_usage_logs` using the service role client (already available). Call it after the streaming response completes — since we can't easily count tokens from a stream, estimate based on system prompt character count (~4 chars/token for input) and track it. For the intent classification call, log separately with `feature_type: 'chip_intent'`.

Pricing table (per 1M tokens, embedded in the function):
- `google/gemini-2.5-flash-lite`: input $0.075, output $0.30
- `google/gemini-2.5-flash`: input $0.15, output $0.60
- `google/gemini-3-flash-preview`: input $0.15, output $0.60
- `google/gemini-2.5-pro`: input $1.25, output $10.00
- Default fallback: input $0.50, output $1.50

Since streaming doesn't return token counts, estimate:
- Input tokens: count characters in system prompt + messages, divide by 4
- Output tokens: count characters in streamed response, divide by 4

**Edit: `supabase/functions/parse-receipt/index.ts`**

Add the same `logUsage` helper. Log after each AI call:
- Receipt extraction call → `feature_type: 'receipt_parse'`
- Name normalization call → `feature_type: 'receipt_normalize'`

For non-streaming calls, try to extract `usage.prompt_tokens` and `usage.completion_tokens` from the response JSON when available (Lovable gateway and OpenAI return these). Fall back to character-based estimation.

### 3. Admin Page

**Create: `src/pages/AdminPanel.tsx`**

A dashboard showing:
- **Cost cards**: Total cost today, this week, this month (queries with date filters)
- **Feature breakdown table**: Cost by `feature_type` this month
- **Averages**: Average cost per `receipt_parse` call, average cost per `chip_chat` call
- **Recent logs table**: Last 50 API calls with timestamp, feature, model, tokens, cost

Gate access: check `user?.email === 'sdodd987@gmail.com'` — if not, redirect to `/app`.

### 4. Routing + Navigation

**Edit: `src/App.tsx`**
- Import `AdminPanel` and add route `/app/admin`

**Edit: `src/pages/SettingsPage.tsx`**
- At the top, before "SKU Management" card, conditionally render an "Admin Panel" link if `user?.email === 'sdodd987@gmail.com'`

### Files changed
- **Migration**: Create `api_usage_logs` table with RLS + `is_admin_user()` function
- **Edit**: `supabase/functions/chip-chat/index.ts` — add usage logging after AI calls
- **Edit**: `supabase/functions/parse-receipt/index.ts` — add usage logging after AI calls
- **Create**: `src/pages/AdminPanel.tsx` — admin dashboard
- **Edit**: `src/App.tsx` — add admin route
- **Edit**: `src/pages/SettingsPage.tsx` — add admin link at top for owner

