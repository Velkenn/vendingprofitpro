

## Add Copy to Clipboard for Chip's Responses

### Change

**Edit: `src/pages/Chat.tsx`**

- Import `Copy` and `Check` icons from lucide-react
- Add a `copyToClipboard` function that finds the preceding user message for a given assistant message index, formats the text as `Q: {question}\n\nA: {answer}`, and copies it using `navigator.clipboard.writeText()`
- Add a small state tracker (`copiedIndex`) to show a brief checkmark confirmation after copying
- Place a "Copy" button next to the existing "Save to Memory" button below each assistant response (lines 292-298), styled identically

The copied text will include the user's question prefixed with "Q:" and Chip's answer prefixed with "A:" so recipients get full context.

### Files changed
- **Edit**: `src/pages/Chat.tsx` — add copy button with question context next to Save to Memory

