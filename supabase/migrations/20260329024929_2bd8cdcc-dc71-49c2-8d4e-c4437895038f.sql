
-- Create machines table
CREATE TABLE public.machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  location text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own machines" ON public.machines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own machines" ON public.machines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own machines" ON public.machines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own machines" ON public.machines FOR DELETE USING (auth.uid() = user_id);

-- Create machine_sales table
CREATE TABLE public.machine_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  date date NOT NULL,
  cash_amount numeric NOT NULL DEFAULT 0,
  credit_amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.machine_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own machine_sales" ON public.machine_sales FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own machine_sales" ON public.machine_sales FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own machine_sales" ON public.machine_sales FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own machine_sales" ON public.machine_sales FOR DELETE USING (auth.uid() = user_id);

-- Create machine_skus table
CREATE TABLE public.machine_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(machine_id, sku_id)
);

ALTER TABLE public.machine_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own machine_skus" ON public.machine_skus FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own machine_skus" ON public.machine_skus FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own machine_skus" ON public.machine_skus FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own machine_skus" ON public.machine_skus FOR DELETE USING (auth.uid() = user_id);
