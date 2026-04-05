

## Add Chat Tab with AI Assistant "Chip" — Full Data Access

### Overview
Create the entire Chip chat feature from scratch: database table, edge function, chat page, and navigation changes. Chip will have access to ALL of the user's SKUs and receipts (not just summaries).

### 1. Database Migration — `chip_memories` table

```sql
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
```

### 2. New Edge Function — `supabase/functions/chip-chat/index.ts`

- Accepts `{ messages }` with Authorization header
- Authenticates user, fetches their AI provider settings (falls back to Lovable AI via `LOVABLE_API_KEY`)
- Fetches ALL user data using service role client:
  - **All SKUs**: id, sku_name, sell_price, category, rebuy_status, default_is_personal
  - **All receipts**: id, vendor, receipt_date, store_location, total, tax, subtotal, item_count
  - **All receipt_items**: raw_name, qty, pack_size, line_total, unit_cost, is_personal, sku_id, receipt_id
  - **All machines + machine_sales**: name, location, date, cash_amount, credit_amount
  - **All chip_memories**: memory_text
- Serializes this into a structured system prompt context section
- System prompt defines Chip as a friendly vending industry expert who:
  - Can answer questions about any SKU, receipt, cost, profit, trend
  - Proactively compares periods and offers insights
  - References saved memories when relevant
  - Knows typical vending margins, seasonal patterns, restocking advice
- Streams response back via SSE for real-time token rendering
- Handles all 3 providers (Anthropic, OpenAI, Google) + Lovable AI fallback

### 3. New Page — `src/pages/Chat.tsx`

**Chip's Memory** (collapsible card at top):
- Fetches from `chip_memories`, each with delete button
- Collapsed by default

**Suggested questions** (shown when no messages):
- "What is my most profitable SKU?"
- "How much did I spend last month?"
- "Which machine is performing best?"
- "What should I restock soon?"

**Chat interface**:
- User messages right-aligned in green, Chip messages left with robot avatar
- Streaming SSE rendering with `react-markdown`
- "Save to Memory" button under each Chip response
- Input bar fixed above bottom nav

### 4. Navigation Changes

**`src/components/BottomNav.tsx`**: Reorder to Home, Chat, Stats, Machines, Receipts. Remove SKUs.

**`src/pages/SettingsPage.tsx`**: Add link to SKUs page in the More section.

**`src/App.tsx`**: Add `/chat` route.

**Install**: `react-markdown` package.

### Files changed
- **Migration**: Create `chip_memories` table with RLS
- **New**: `supabase/functions/chip-chat/index.ts`
- **New**: `src/pages/Chat.tsx`
- **Edit**: `src/components/BottomNav.tsx`
- **Edit**: `src/pages/SettingsPage.tsx`
- **Edit**: `src/App.tsx`

