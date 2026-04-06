import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LogOut, FileDown, Zap, Package, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AISettingsDialog from "@/components/settings/AISettingsDialog";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${r[h] ?? ""}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState("0");
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_settings")
      .select("week_start_day")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setWeekStart(String(data.week_start_day));
      });
  }, [user]);

  const saveWeekStart = async (val: string) => {
    if (!user) return;
    setWeekStart(val);
    const { error } = await supabase
      .from("user_settings")
      .upsert({ user_id: user.id, week_start_day: parseInt(val) }, { onConflict: "user_id" });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Saved" });
  };

  const exportTable = async (table: "receipts" | "receipt_items" | "skus") => {
    if (!user) return;
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    if (!data || data.length === 0) {
      toast({ title: "No data", description: `No ${table} data to export.` });
      return;
    }
    downloadCsv(`emvending_${table}.csv`, data as Record<string, unknown>[]);
    toast({ title: "Exported", description: `${data.length} ${table} rows exported.` });
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Settings</h1>

      {/* Admin Panel (owner only) */}
      {user?.email === "sdodd987@gmail.com" && (
        <Card className="border-0 shadow-sm mb-4">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Admin Panel</p>
                <p className="text-xs text-muted-foreground">View API usage and costs</p>
              </div>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/app/admin")}>
                <Shield className="h-4 w-4" /> Open
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SKUs Link */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">SKU Management</p>
              <p className="text-xs text-muted-foreground">View and manage your product catalog</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/app/skus")}>
              <Package className="h-4 w-4" /> View SKUs
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* AI Settings */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">AI Settings</p>
              <p className="text-xs text-muted-foreground">Connect your AI provider for receipt parsing</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAiSettingsOpen(true)}>
              <Zap className="h-4 w-4" /> Configure
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="p-4 space-y-3">
          <p className="font-medium text-sm">Week Start Day</p>
          <Select value={weekStart} onValueChange={saveWeekStart}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {days.map((d, i) => (
                <SelectItem key={i} value={String(i)}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm mb-6">
        <CardContent className="p-4 space-y-3">
          <p className="font-medium text-sm">Export Data</p>
          <div className="space-y-2">
            {(["receipts", "receipt_items", "skus"] as const).map((t) => (
              <div key={t} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground capitalize">{t.replace("_", " ")}</span>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => exportTable(t)}>
                  <FileDown className="h-4 w-4" /> CSV
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full gap-2 text-destructive" onClick={signOut}>
        <LogOut className="h-4 w-4" /> Sign Out
      </Button>

      <AISettingsDialog open={aiSettingsOpen} onOpenChange={setAiSettingsOpen} />
    </div>
  );
}
