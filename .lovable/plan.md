

## Support Image Receipt Parsing (Same as PDFs)

### Problem
Currently, when a user uploads an image (JPG, PNG, etc.), the edge function tries to extract text using `pdfjs-serverless`, which fails with "Invalid PDF structure." Images need to be sent directly to the user's AI provider as vision input instead of going through PDF text extraction.

### Solution
Detect whether the uploaded file is an image or PDF. For images, skip PDF text extraction entirely and send the image directly to the AI provider's vision/multimodal API. All three supported providers (Anthropic, OpenAI, Google) support image inputs.

### Implementation (single file: `supabase/functions/parse-receipt/index.ts`)

**1. Add image detection helper**
- Check file bytes for magic bytes (JPEG: `FF D8`, PNG: `89 50 4E 47`) or check the file extension from `file_path`
- Add a helper: `isImageFile(bytes: Uint8Array, filePath: string): boolean`

**2. Add `parseImageWithUserProvider` function**
- Convert image bytes to base64
- For each provider, send the image as a vision input alongside the same `SYSTEM_PROMPT` and `EXTRACT_TOOL`:
  - **Anthropic**: Use `content: [{ type: "image", source: { type: "base64", media_type, data } }, { type: "text", text: prompt }]`
  - **OpenAI**: Use `content: [{ type: "image_url", image_url: { url: "data:image/...;base64,..." } }, { type: "text", text: prompt }]`
  - **Google**: Use `contents: [{ parts: [{ inlineData: { mimeType, data } }, { text: prompt }] }]`
- Return the same `ParsedReceipt` structure as `parseWithUserProvider`

**3. Update main handler flow (line ~795-810)**
- After downloading the file, check if it's an image
- If image:
  - Require AI config (no regex fallback for images — can't extract text without AI)
  - If no AI configured, fail with a clear message: "Image receipts require an AI provider. Please configure one in Settings → AI Settings."
  - Call `parseImageWithUserProvider` instead of `extractPdfText` + `parseWithUserProvider`
- If PDF: keep existing flow unchanged
- Everything after parsing (SKU matching, normalization, insert) stays the same

**4. Base64 chunking consideration**
- Images can be large; encode to base64 in one shot (Deno handles this fine for typical receipt photos ~1-5MB)

### Files changed
- **Edit**: `supabase/functions/parse-receipt/index.ts` — add image detection, vision-based parsing for all 3 providers, route images through vision API in main handler

