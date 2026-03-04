import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

function downloadCsv(filename: string, rows: Record<string, any>[]) {
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

export default function Export() {
  const { user } = useAuth();
  const { toast } = useToast();

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
    downloadCsv(`emvending_${table}.csv`, data);
    toast({ title: "Exported", description: `${data.length} ${table} rows exported.` });
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Export Reports</h1>
      <div className="space-y-3">
        {(["receipts", "receipt_items", "skus"] as const).map((t) => (
          <Card key={t} className="border-0 shadow-sm">
            <CardContent className="flex items-center justify-between p-4">
              <span className="font-medium text-sm capitalize">{t.replace("_", " ")}</span>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => exportTable(t)}>
                <FileDown className="h-4 w-4" /> CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
