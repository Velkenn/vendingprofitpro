

## Improve Chip Chat: Concise Responses + Scrollable Header

### 1. Update System Prompt for Concise Responses

**Edit: `supabase/functions/chip-chat/index.ts`** (lines 148-157, Guidelines section)

Replace the current guidelines with instructions enforcing the concise format:
- Lead with the single most important insight in **bold**
- Follow with max 3 short bullet points, each containing a specific number or dollar figure
- No section headers, no nested lists
- End with one short actionable recommendation
- Total response must fit on one phone screen (roughly 100 words max)

### 2. Make Header + Memory Scroll With Content

**Edit: `src/pages/Chat.tsx`** (lines 207-260)

Currently the layout is:
- Fixed header (Chip title + Memory card)
- Scrollable chat area (`flex-1 overflow-y-auto`)
- Fixed input bar

Change to:
- Single scrollable container holding header + Memory + chat bubbles together
- Input bar stays fixed at bottom

Structurally: wrap the outer `div` so the header and chat messages share one scroll container, and only the input form remains outside/fixed. This way the header scrolls away as the user reads down the conversation.

### Files changed
- **Edit**: `supabase/functions/chip-chat/index.ts` — rewrite Guidelines section for concise mobile-friendly responses
- **Edit**: `src/pages/Chat.tsx` — merge header into scrollable chat area so it scrolls away

