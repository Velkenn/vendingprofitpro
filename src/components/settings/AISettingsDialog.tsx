import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Check, X, Star, Zap } from "lucide-react";

interface AISettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProviderConfig {
  id: string;
  name: string;
  models: string[];
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    name: "Claude",
    models: ["claude-opus-4", "claude-sonnet-4"],
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    icon: "🟠",
  },
  {
    id: "openai",
    name: "ChatGPT",
    models: ["gpt-4o", "gpt-4-turbo"],
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    icon: "🟢",
  },
  {
    id: "google",
    name: "Gemini",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    icon: "🔵",
  },
];

interface SavedProvider {
  provider: string;
  model: string;
  is_default: boolean;
}

export default function AISettingsDialog({ open, onOpenChange }: AISettingsDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [savedProviders, setSavedProviders] = useState<SavedProvider[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; error?: string }>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const loadProviders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-settings?action=list", {
        method: "GET",
      });
      if (error) throw error;
      setSavedProviders(data.providers || []);
      // Initialize model selections from saved data
      const modelMap: Record<string, string> = {};
      for (const p of data.providers || []) {
        modelMap[p.provider] = p.model;
      }
      setModels((prev) => ({ ...prev, ...modelMap }));
    } catch (e) {
      console.error("Failed to load AI settings:", e);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (open) {
      loadProviders();
      setApiKeys({});
      setTestResults({});
    }
  }, [open, loadProviders]);

  const isConnected = (providerId: string) =>
    savedProviders.some((p) => p.provider === providerId);

  const isDefault = (providerId: string) =>
    savedProviders.find((p) => p.provider === providerId)?.is_default || false;

  const handleTest = async (providerId: string) => {
    const key = apiKeys[providerId];
    const model = models[providerId] || PROVIDERS.find((p) => p.id === providerId)!.models[0];
    if (!key) {
      toast({ title: "Enter an API key first", variant: "destructive" });
      return;
    }
    setTesting((p) => ({ ...p, [providerId]: true }));
    setTestResults((p) => ({ ...p, [providerId]: undefined as any }));
    try {
      const { data, error } = await supabase.functions.invoke("ai-settings?action=test", {
        body: { provider: providerId, api_key: key, model },
      });
      if (error) throw error;
      setTestResults((p) => ({ ...p, [providerId]: data }));
      if (data.ok) {
        toast({ title: "Connection successful!" });
      } else {
        toast({ title: "Connection failed", description: data.error, variant: "destructive" });
      }
    } catch (e: any) {
      setTestResults((p) => ({ ...p, [providerId]: { ok: false, error: e.message } }));
      toast({ title: "Test failed", description: e.message, variant: "destructive" });
    }
    setTesting((p) => ({ ...p, [providerId]: false }));
  };

  const handleSave = async (providerId: string) => {
    const key = apiKeys[providerId];
    const model = models[providerId] || PROVIDERS.find((p) => p.id === providerId)!.models[0];
    if (!key) {
      toast({ title: "Enter an API key first", variant: "destructive" });
      return;
    }
    setSaving((p) => ({ ...p, [providerId]: true }));
    try {
      const isFirstProvider = savedProviders.length === 0;
      const { data, error } = await supabase.functions.invoke("ai-settings?action=save", {
        body: { provider: providerId, api_key: key, model, is_default: isFirstProvider },
      });
      if (error) throw error;
      toast({ title: "Provider connected!" });
      setApiKeys((p) => ({ ...p, [providerId]: "" }));
      await loadProviders();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
    setSaving((p) => ({ ...p, [providerId]: false }));
  };

  const handleDisconnect = async (providerId: string) => {
    try {
      const { error } = await supabase.functions.invoke("ai-settings?action=delete", {
        body: { provider: providerId },
      });
      if (error) throw error;
      toast({ title: "Provider disconnected" });
      await loadProviders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleSetDefault = async (providerId: string) => {
    try {
      const { error } = await supabase.functions.invoke("ai-settings?action=set_default", {
        body: { provider: providerId },
      });
      if (error) throw error;
      toast({ title: "Default provider updated" });
      await loadProviders();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            AI Settings
          </DialogTitle>
          <DialogDescription>
            Connect your own AI provider for receipt parsing. Your API keys are encrypted and never exposed.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {PROVIDERS.map((provider) => {
              const connected = isConnected(provider.id);
              const defaultProvider = isDefault(provider.id);
              const testResult = testResults[provider.id];

              return (
                <div
                  key={provider.id}
                  className={`rounded-lg border p-4 space-y-3 ${
                    connected ? provider.borderColor : "border-border"
                  } ${connected ? provider.bgColor : ""}`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{provider.icon}</span>
                      <span className={`font-semibold ${connected ? provider.color : ""}`}>
                        {provider.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {connected && (
                        <Badge variant="outline" className="text-xs border-green-300 text-green-700 bg-green-50">
                          <Check className="h-3 w-3 mr-1" /> Connected
                        </Badge>
                      )}
                      {defaultProvider && (
                        <Badge variant="default" className="text-xs">
                          <Star className="h-3 w-3 mr-1" /> Default
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Model selector */}
                  <Select
                    value={models[provider.id] || provider.models[0]}
                    onValueChange={(v) => setModels((p) => ({ ...p, [provider.id]: v }))}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {provider.models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* API Key input (only show if not connected, or to update) */}
                  {!connected && (
                    <>
                      <Input
                        type="password"
                        placeholder={`Enter ${provider.name} API key`}
                        value={apiKeys[provider.id] || ""}
                        onChange={(e) =>
                          setApiKeys((p) => ({ ...p, [provider.id]: e.target.value }))
                        }
                        className="h-9 text-sm"
                      />

                      {/* Test result */}
                      {testResult && (
                        <div
                          className={`text-xs px-2 py-1 rounded ${
                            testResult.ok
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {testResult.ok ? "✓ Key verified" : `✗ ${testResult.error}`}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleTest(provider.id)}
                          disabled={!apiKeys[provider.id] || testing[provider.id]}
                          className="flex-1"
                        >
                          {testing[provider.id] ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Test"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSave(provider.id)}
                          disabled={!apiKeys[provider.id] || saving[provider.id]}
                          className="flex-1"
                        >
                          {saving[provider.id] ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Connect"
                          )}
                        </Button>
                      </div>
                    </>
                  )}

                  {/* Connected actions */}
                  {connected && (
                    <div className="flex gap-2">
                      {!defaultProvider && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSetDefault(provider.id)}
                          className="flex-1"
                        >
                          <Star className="h-3 w-3 mr-1" /> Set Default
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDisconnect(provider.id)}
                        className="flex-1 text-destructive hover:text-destructive"
                      >
                        <X className="h-3 w-3 mr-1" /> Disconnect
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
