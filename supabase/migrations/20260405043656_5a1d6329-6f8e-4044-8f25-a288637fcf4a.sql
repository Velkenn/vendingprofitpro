CREATE TABLE public.chip_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  memory_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chip_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own memories" ON public.chip_memories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own memories" ON public.chip_memories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own memories" ON public.chip_memories FOR DELETE USING (auth.uid() = user_id);