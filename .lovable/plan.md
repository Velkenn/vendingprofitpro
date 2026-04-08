

## Use Gemini 2.5 Flash for Chip Receipt Parsing

### Problem
When a receipt is uploaded through Chip's chat, it uses the user's default AI provider model (likely Flash-Lite), which is cheaper but less accurate for receipt parsing. Flash should be used instead for better parsing quality.

### Changes

**Edit: `supabase/functions/parse-receipt/index.ts`** (~line 954)

Accept an optional `model_override` parameter from the request body alongside `receipt_id` and `file_path`. When present, override the model in `aiConfig` before passing it to `parseWithUserProvider` / `parseImageWithUserProvider`.

```
const { receipt_id, file_path, model_override } = await req.json();
```

Then after getting `aiConfig` (~line 994), if `model_override` is set and `aiConfig` exists:
```
if (aiConfig && model_override) {
  aiConfig.model = model_override;
}
```

**Edit: `src/pages/Chat.tsx`** (~line 226)

Pass `model_override: "google/gemini-2.5-flash"` in the request body when calling parse-receipt:

```
body: JSON.stringify({ receipt_id: receipt.id, file_path: filePath, model_override: "google/gemini-2.5-flash" }),
```

### Files changed
- **Edit**: `supabase/functions/parse-receipt/index.ts` — accept and apply `model_override` parameter
- **Edit**: `src/pages/Chat.tsx` — pass `model_override` when calling parse-receipt from chat

