import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Package } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export default function SKUs() {
  const { user } = useAuth();
  const [skus, setSkus] = useState<Tables<"skus">[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("skus")
      .select("*")
      .order("sku_name")
      .then(({ data }) => {
        setSkus(data || []);
        setLoading(false);
      });
  }, [user]);

  const filtered = skus.filter((s) =>
    s.sku_name.toLowerCase().includes(search.toLowerCase())
  );

  const rebuyColor = (s: string) => {
    if (s === "Rebuy") return "bg-primary/10 text-primary";
    if (s === "Do Not Rebuy") return "bg-destructive/10 text-destructive";
    return "bg-accent/10 text-accent";
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">SKU Master</h1>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search SKUs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Package className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search ? "No SKUs match your search." : "No SKUs yet. They'll be created when you upload receipts."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((sku) => (
            <Card key={sku.id} className="border-0 shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="font-medium text-sm">{sku.sku_name}</p>
                  <p className="text-xs text-muted-foreground">{sku.category || "Uncategorized"}</p>
                </div>
                <div className="text-right flex flex-col items-end gap-1">
                  <p className="font-bold text-sm">
                    {sku.sell_price != null ? `$${Number(sku.sell_price).toFixed(2)}` : "—"}
                  </p>
                  <Badge variant="secondary" className={`text-xs ${rebuyColor(sku.rebuy_status)}`}>
                    {sku.rebuy_status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
