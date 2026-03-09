
## Compact Stats UI and Unified SKU List

### Current Issues
The Stats page has:
- Large spacing between elements (space-y-6, p-6 on cards)
- Separate sections for top 10 SKUs vs remaining SKUs with a separator
- Inconsistent list item styling between top 10 (p-3) and remaining (py-2 px-3)
- The remaining SKUs scroll area has a max-height that may not be optimal

### Changes

**`src/pages/Stats.tsx`** - Compact spacing and unify SKU list:

1. **Reduce spacing throughout:**
   - Main container: `space-y-6` → `space-y-4`
   - Card headers: `pb-2` → `pb-1`
   - Card content: default `p-6` → `p-4`
   - Summary cards grid: `gap-4` → `gap-3`

2. **Unify SKU list into single scrollable container:**
   - Remove the separation between topSkus and remainingSkus
   - Combine all skuStats into one continuous list
   - Remove the Separator component
   - Remove the "Remaining SKUs" header text
   - Apply consistent styling for all items

3. **Use ScrollArea component for contained scrolling:**
   - Import ScrollArea from "@/components/ui/scroll-area"
   - Wrap the unified SKU list in ScrollArea with a fixed height
   - Ensure scroll is contained within the card, not affecting page scroll

4. **Compact SKU list item styling:**
   - Reduce padding from `p-3` to `py-2 px-3` for all items
   - Make badges smaller and reduce gaps between elements
   - Tighten text line heights and spacing

### Implementation
- Single SKU list with consistent styling for all items (ranked 1-N)
- ScrollArea with max height around 400-500px to fit more content
- Reduced padding and margins throughout for denser layout
- All SKUs in one continuous, contained scrollable list
