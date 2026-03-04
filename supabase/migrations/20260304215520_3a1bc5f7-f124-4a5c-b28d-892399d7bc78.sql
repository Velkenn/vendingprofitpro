
-- Enums
CREATE TYPE public.vendor_type AS ENUM ('sams', 'walmart');
CREATE TYPE public.parse_status_type AS ENUM ('PENDING', 'PARSED', 'PARTIAL_PARSE', 'FAILED');
CREATE TYPE public.rebuy_status_type AS ENUM ('Rebuy', 'Test', 'Do Not Rebuy');
CREATE TYPE public.receipt_type AS ENUM ('sams_scan_and_go', 'walmart_store', 'walmart_delivery');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User settings
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  week_start_day INT NOT NULL DEFAULT 0, -- 0=Sunday
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

-- SKUs
CREATE TABLE public.skus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sku_name TEXT NOT NULL,
  sell_price NUMERIC(10,2),
  category TEXT,
  rebuy_status rebuy_status_type NOT NULL DEFAULT 'Test',
  default_is_personal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.skus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own skus" ON public.skus FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own skus" ON public.skus FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own skus" ON public.skus FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own skus" ON public.skus FOR DELETE USING (auth.uid() = user_id);

-- SKU Aliases
CREATE TABLE public.sku_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id UUID REFERENCES public.skus(id) ON DELETE CASCADE NOT NULL,
  vendor vendor_type NOT NULL,
  raw_name_pattern TEXT NOT NULL,
  pack_size_override INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sku_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view aliases for own skus" ON public.sku_aliases FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.skus WHERE skus.id = sku_aliases.sku_id AND skus.user_id = auth.uid())
);
CREATE POLICY "Users can insert aliases for own skus" ON public.sku_aliases FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.skus WHERE skus.id = sku_aliases.sku_id AND skus.user_id = auth.uid())
);
CREATE POLICY "Users can update aliases for own skus" ON public.sku_aliases FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.skus WHERE skus.id = sku_aliases.sku_id AND skus.user_id = auth.uid())
);
CREATE POLICY "Users can delete aliases for own skus" ON public.sku_aliases FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.skus WHERE skus.id = sku_aliases.sku_id AND skus.user_id = auth.uid())
);

-- Receipts
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vendor vendor_type NOT NULL,
  receipt_type receipt_type,
  receipt_date DATE NOT NULL,
  receipt_identifier TEXT,
  store_location TEXT,
  item_count INT,
  subtotal NUMERIC(10,2),
  tax NUMERIC(10,2),
  total NUMERIC(10,2),
  parse_status parse_status_type NOT NULL DEFAULT 'PENDING',
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own receipts" ON public.receipts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own receipts" ON public.receipts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own receipts" ON public.receipts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own receipts" ON public.receipts FOR DELETE USING (auth.uid() = user_id);

-- Receipt Items
CREATE TABLE public.receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID REFERENCES public.receipts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sku_id UUID REFERENCES public.skus(id) ON DELETE SET NULL,
  raw_name TEXT NOT NULL,
  normalized_name TEXT,
  qty INT NOT NULL DEFAULT 1,
  pack_size INT,
  pack_size_uom TEXT,
  unit_cost NUMERIC(10,4),
  line_total NUMERIC(10,2) NOT NULL,
  is_personal BOOLEAN NOT NULL DEFAULT false,
  needs_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own receipt items" ON public.receipt_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own receipt items" ON public.receipt_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own receipt items" ON public.receipt_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own receipt items" ON public.receipt_items FOR DELETE USING (auth.uid() = user_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_skus_updated_at BEFORE UPDATE ON public.skus FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_receipts_updated_at BEFORE UPDATE ON public.receipts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_receipt_items_updated_at BEFORE UPDATE ON public.receipt_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Indexes
CREATE INDEX idx_receipts_user_date ON public.receipts (user_id, receipt_date DESC);
CREATE INDEX idx_receipt_items_receipt ON public.receipt_items (receipt_id);
CREATE INDEX idx_receipt_items_sku ON public.receipt_items (sku_id);
CREATE INDEX idx_receipt_items_needs_review ON public.receipt_items (user_id, needs_review) WHERE needs_review = true;
CREATE INDEX idx_skus_user ON public.skus (user_id);
CREATE INDEX idx_sku_aliases_pattern ON public.sku_aliases (vendor, raw_name_pattern);

-- Storage bucket for receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);
CREATE POLICY "Users can upload own receipts" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own receipts" ON storage.objects FOR SELECT USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own receipts" ON storage.objects FOR DELETE USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);
