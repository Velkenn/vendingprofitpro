
CREATE TABLE public.ai_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('anthropic', 'openai', 'google')),
  encrypted_api_key text NOT NULL,
  model text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.ai_provider_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ai settings" ON public.ai_provider_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai settings" ON public.ai_provider_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ai settings" ON public.ai_provider_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ai settings" ON public.ai_provider_settings FOR DELETE USING (auth.uid() = user_id);
