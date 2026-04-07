CREATE TABLE public.restock_warnings_shown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sku_id uuid,
  feature_type text NOT NULL DEFAULT 'restock',
  alert_key text,
  shown_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.restock_warnings_shown ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own warnings" ON public.restock_warnings_shown
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own warnings" ON public.restock_warnings_shown
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_restock_user_date ON public.restock_warnings_shown (user_id, shown_date, feature_type);