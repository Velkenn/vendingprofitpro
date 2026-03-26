import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ["claude-opus-4", "claude-sonnet-4"],
  openai: ["gpt-4o", "gpt-4-turbo"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
};

async function testProviderKey(provider: string, apiKey: string, model: string): Promise<{ ok: boolean; error?: string }> {
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: "user", content: "Hi" }] }),
      });
      if (!res.ok) { const t = await res.text(); return { ok: false, error: `Anthropic ${res.status}: ${t.slice(0, 200)}` }; }
      return { ok: true };
    }
    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: "user", content: "Hi" }] }),
      });
      if (!res.ok) { const t = await res.text(); return { ok: false, error: `OpenAI ${res.status}: ${t.slice(0, 200)}` }; }
      return { ok: true };
    }
    if (provider === "google") {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Hi" }] }], generationConfig: { maxOutputTokens: 10 } }),
      });
      if (!res.ok) { const t = await res.text(); return { ok: false, error: `Google ${res.status}: ${t.slice(0, 200)}` }; }
      return { ok: true };
    }
    return { ok: false, error: "Unknown provider" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const encryptionKey = Deno.env.get("AI_ENCRYPTION_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // LIST — returns connected status per provider (never the key)
    if (action === "list") {
      const { data, error } = await supabase
        .from("ai_provider_settings")
        .select("provider, model, is_default, created_at")
        .eq("user_id", user.id);
      if (error) throw error;
      return new Response(JSON.stringify({ providers: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // SAVE — encrypt key and upsert
    if (action === "save") {
      const { provider, api_key, model, is_default } = body;
      if (!provider || !api_key || !model) {
        return new Response(JSON.stringify({ error: "Missing provider, api_key, or model" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!PROVIDER_MODELS[provider]?.includes(model)) {
        return new Response(JSON.stringify({ error: "Invalid model for provider" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Encrypt the API key
      const { data: encryptedKey, error: encErr } = await supabase.rpc("encrypt_ai_key", {
        plain_text: api_key,
        encryption_key: encryptionKey,
      });
      if (encErr) throw encErr;

      // If setting as default, unset others
      if (is_default) {
        await supabase.from("ai_provider_settings").update({ is_default: false }).eq("user_id", user.id);
      }

      const { error: upsertErr } = await supabase
        .from("ai_provider_settings")
        .upsert({
          user_id: user.id,
          provider,
          encrypted_api_key: encryptedKey,
          model,
          is_default: is_default || false,
        }, { onConflict: "user_id,provider" });
      if (upsertErr) throw upsertErr;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TEST — test the key without saving
    if (action === "test") {
      const { provider, api_key, model } = body;
      if (!provider || !api_key || !model) {
        return new Response(JSON.stringify({ error: "Missing provider, api_key, or model" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await testProviderKey(provider, api_key, model);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE
    if (action === "delete") {
      const { provider } = body;
      if (!provider) {
        return new Response(JSON.stringify({ error: "Missing provider" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase.from("ai_provider_settings").delete().eq("user_id", user.id).eq("provider", provider);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SET DEFAULT
    if (action === "set_default") {
      const { provider } = body;
      if (!provider) {
        return new Response(JSON.stringify({ error: "Missing provider" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase.from("ai_provider_settings").update({ is_default: false }).eq("user_id", user.id);
      await supabase.from("ai_provider_settings").update({ is_default: true }).eq("user_id", user.id).eq("provider", provider);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-settings error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
