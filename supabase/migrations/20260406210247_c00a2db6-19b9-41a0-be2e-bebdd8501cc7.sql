CREATE TABLE public.api_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  feature_type text NOT NULL,
  model_used text NOT NULL,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  estimated_cost_usd numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Service insert"
  ON public.api_usage_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_api_usage_logs_created ON public.api_usage_logs (created_at DESC);
CREATE INDEX idx_api_usage_logs_feature ON public.api_usage_logs (feature_type);