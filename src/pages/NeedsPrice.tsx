import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tag, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSKUDetail } from "@/contexts/SKUDetailContext";
import type { Tables } from "@/integrations/supabase/types";

export default function NeedsPrice() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { openSKUDetail } = useSKUDetail();
  const [skus, setSkus] = useState<Tables<"skus">[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const loadSkus = () => {
    if (!user) return;
    supabase
      .from("skus")
      .select("*")
      .is("sell_price", null)
      .order("sku_name")
      .then(({ data }) => {
        setSkus(data || []);
        setLoading(false);
      });
  };

  useEffect(() => { loadSkus(); }, [user]);

  const savePrice = async (skuId: string) => {
    const price = parseFloat(prices[skuId]);
    if (isNaN(price)) return;
    const { error } = await supabase.from("skus").update({ sell_price: price }).eq("id", skuId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Price saved!" });
      setSkus((prev) => prev.filter((s) => s.id !== skuId));
    }
  };

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Needs Price</h1>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : skus.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Tag className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">All SKUs have prices set!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {skus.map((sku) => (
            <Card key={sku.id} className="border-0 shadow-sm">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex-1">
                  <p className="font-medium text-sm cursor-pointer underline decoration-dotted" onClick={() => openSKUDetail(sku.id)}>{sku.sku_name}</p>
                  <p className="text-xs text-muted-foreground">{sku.category}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="$"
                    className="w-20 h-8 text-sm"
                    value={prices[sku.id] || ""}
                    onChange={(e) => setPrices((p) => ({ ...p, [sku.id]: e.target.value }))}
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => savePrice(sku.id)}>
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
