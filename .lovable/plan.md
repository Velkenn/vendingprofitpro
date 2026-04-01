

## Editable Purchase History Cards + Better SKU Deduplication

### 1. Editable Purchase History Cards in SKUDetailModal

**File: `src/components/sku/SKUDetailModal.tsx`**

- Add state: `editingIndex` (which card is being edited or null), `editQty`, `editPackSize`, `editLineTotal`, `editSaving`
- Each purchase history card becomes tappable — clicking sets `editingIndex` and pre-fills edit fields from `receipt_items` data
- The edit view replaces the card content with input fields for qty, pack_size, line_total, plus Save and Delete buttons
- Need to also fetch `receipt_items.id` in the query so we can update/delete by ID
- **Save**: `supabase.from("receipt_items").update({ qty, pack_size, line_total, unit_cost: computed }).eq("id", itemId)`
- **Delete**: `supabase.from("receipt_items").delete().eq("id", itemId)` then refresh
- After save/delete, re-fetch data to update the modal

### 2. Stronger SKU Deduplication

**File: `supabase/functions/parse-receipt/index.ts`**

The current matching is exact on `normalizedName.toLowerCase()`. Slight AI variations like "Monster Energy Zero" vs "Monster Energy Zero Ultra" create duplicates.

**Two-pronged fix:**

**A. Enhanced AI normalization prompt** — Update `NORMALIZE_SYSTEM` to add:
- "If two names refer to the same product, normalize them identically"
- Include the user's existing SKU names in the prompt so the AI can match against them directly
- Change the prompt to: "Here are the user's existing SKU names: [list]. For each raw name, return the matching existing SKU name if it's clearly the same product, or create a new normalized name if it's genuinely new."

**B. Fuzzy matching fallback** — After exact match fails, do a simple similarity check:
- Normalize both strings (lowercase, strip punctuation/spaces)
- Check if one name starts with or contains the other
- Compute word-overlap ratio: if 80%+ of words match, treat as same SKU
- This catches cases like "Smucker's Uncrustables PB&J" vs "Smuckers Uncrustables PBJ"

**Implementation detail for the AI-aware matching:**
```
// In the main handler, before calling normalizeNamesWithAI:
// Pass existing SKU names to the normalize function
const existingSkuNames = existingSkus?.map(s => s.sku_name) || [];
// Update normalizeNamesWithAI to accept and include them in the prompt
```

Update `NORMALIZE_SYSTEM` and `normalizeNamesWithAI` signature to accept existing SKU names and include them in the prompt as reference names to match against.

Add a `fuzzyMatchSku` helper function that compares word sets between two names and returns true if overlap >= 80%.

### Summary of changes
- `src/components/sku/SKUDetailModal.tsx` — add edit/delete to purchase history cards
- `supabase/functions/parse-receipt/index.ts` — pass existing SKU names to AI normalization, add fuzzy matching fallback

