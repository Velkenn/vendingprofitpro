

## Add User-Managed AI Keys for Receipt Parsing

### Overview
Add an "AI Settings" section to the Settings page where users can configure their own API keys for Anthropic, OpenAI, or Google Gemini. The parse-receipt edge function will use the user's chosen provider/model instead of the Lovable AI gateway.

### Database Changes

**New table: `ai_provider_settings`**
```sql
CREATE TABLE public.ai_provider_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('anthropic', 'openai', 'google')),
  encrypted_api_key text NOT NULL,
  model text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

ALTER TABLE public.ai_provider_settings ENABLE ROW LEVEL SECURITY;
-- RLS: users can only CRUD their own rows
```

API keys will be stored encrypted using `pgcrypto` with a server-side encryption key stored as a Supabase secret.

### New Edge Function: `ai-settings`

Handles:
- **POST /save** — Encrypts and stores the API key server-side, never returning the raw key
- **POST /test** — Tests the key by sending a simple completion request to the provider's API
- **GET /list** — Returns provider, model, is_default, and connected status (but NOT the key)
- **POST /delete** — Removes a provider's key

### Edge Function Changes: `parse-receipt`

Update Phase 2 fallback logic:
1. Query `ai_provider_settings` for the user's default provider
2. If found, use that provider's API directly (Anthropic, OpenAI, or Google) with the decrypted key
3. If no user key configured, return an error telling the user to configure an AI provider in Settings
4. Remove the Lovable AI gateway dependency entirely

Provider-specific API calls:
- **Anthropic**: `https://api.anthropic.com/v1/messages` with `x-api-key` header, tool use for structured output
- **OpenAI**: `https://api.openai.com/v1/chat/completions` with Bearer auth, function calling
- **Google**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with API key param

### Frontend Changes

**File: `src/pages/SettingsPage.tsx`**
- Add an "AI Settings" card with a button that opens a dialog/modal

**New file: `src/components/settings/AISettingsDialog.tsx`**
- Dialog showing three provider cards (Anthropic/Claude, OpenAI/ChatGPT, Google/Gemini)
- Each card has:
  - Brand color accent (Anthropic: orange-brown, OpenAI: green/black, Google: blue)
  - Password-masked API key input
  - Model selector dropdown:
    - Claude: claude-opus-4, claude-sonnet-4
    - OpenAI: gpt-4o, gpt-4-turbo  
    - Google: gemini-2.5-pro, gemini-2.5-flash
  - "Test Connection" button that calls the edge function test endpoint
  - "Connect" / "Disconnect" button
  - Green "Connected" badge when saved
  - "Set as Default" radio/toggle — only one provider can be default
  - Inline error display for invalid keys

### Security
- API keys are encrypted at rest using `pgp_sym_encrypt` with a secret stored in Supabase secrets
- Keys are never sent back to the client — only a "connected" boolean
- Decryption only happens server-side in edge functions
- RLS ensures users only access their own settings

### Error Handling
- Invalid/expired key: inline error on the provider card after test fails
- Parsing failure: toast showing which provider failed with suggestion to check the key
- No provider configured: prompt user to set up AI in Settings before parsing

### Implementation Order
1. Add encryption secret via `add_secret`
2. Create `ai_provider_settings` table migration
3. Create `ai-settings` edge function
4. Update `parse-receipt` to use user's provider
5. Build `AISettingsDialog` component
6. Add AI Settings button to SettingsPage

