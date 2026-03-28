import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase/types";

interface PurchaseEntry {
  date: string;
  vendor: string;
  qty: number;
  pack_size: number | null;
  unit_cost: number | null;
  line_total: number;
  units: number;
  revenue: number | null;
  profit: number | null;
}

interface Summary {
  total_units: number;
  avg_cost_per_unit: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
}

interface Props {
  skuId: string | null;
  open: boolean;
  onClose: () => void;
}

export default function SKUDetailModal({ skuId, open, onClose }: Props) {
  const [sku, setSku] = useState<Tables<"skus"> | null>(null);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!skuId || !open) return;
    setLoading(true);

    Promise.all([
      supabase.from("skus").select("*").eq("id", skuId).single(),
      supabase
        .from("receipt_items")
        .select("qty, pack_size, unit_cost, line_total, receipts!inner(receipt_date, vendor)")
        .eq("sku_id", skuId)
        .order("created_at", { ascending: false }),
    ]).then(([skuRes, itemsRes]) => {
      const skuData = skuRes.data;
      setSku(skuData);

      const raw = (itemsRes.data || []) as unknown as Array<{
        qty: number;
        pack_size: number | null;
        unit_cost: number | null;
        line_total: number;
        receipts: { receipt_date: string; vendor: string };
      }>;

      const sellPrice = skuData?.sell_price ? Number(skuData.sell_price) : null;

      let totalUnits = 0;
      let totalCost = 0;
      let totalRevenue = 0;

      const entries: PurchaseEntry[] = raw.map((item) => {
        const units = (item.qty || 1) * (item.pack_size || 1);
        const revenue = sellPrice != null ? units * sellPrice : null;
        const profit = revenue != null ? revenue - Number(item.line_total) : null;

        totalUnits += units;
        totalCost += Number(item.line_total);
        if (revenue != null) totalRevenue += revenue;

        return {
          date: item.receipts.receipt_date,
          vendor: item.receipts.vendor,
          qty: item.qty,
          pack_size: item.pack_size,
          unit_cost: item.unit_cost,
          line_total: Number(item.line_total),
          units,
          revenue,
          profit,
        };
      });

      setPurchases(entries);
      setSummary({
        total_units: totalUnits,
        avg_cost_per_unit: totalUnits > 0 ? totalCost / totalUnits : 0,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_profit: totalRevenue - totalCost,
      });
      setLoading(false);
    });
  }, [skuId, open]);

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  const rebuyColor = (s: string) => {
    if (s === "Rebuy") return "bg-primary/10 text-primary";
    if (s === "Core") return "bg-chart-2/10 text-chart-2";
    if (s === "Do Not Rebuy" || s === "Failed") return "bg-destructive/10 text-destructive";
    return "bg-accent/10 text-accent";
  };

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="relative border-b bg-primary/5 pb-3">
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
          <DrawerTitle className="pr-8 text-base leading-snug">
            {sku?.sku_name || "Loading..."}
          </DrawerTitle>
          <DrawerDescription className="sr-only">SKU details and purchase history</DrawerDescription>
          {sku && (
            <div className="flex gap-2 mt-1">
              {sku.category && (
                <Badge variant="outline" className="text-xs">{sku.category}</Badge>
              )}
              <Badge variant="secondary" className={`text-xs ${rebuyColor(sku.rebuy_status)}`}>
                {sku.rebuy_status}
              </Badge>
              {sku.sell_price != null && (
                <Badge variant="outline" className="text-xs">
                  Sell: {fmt(Number(sku.sell_price))}
                </Badge>
              )}
            </div>
          )}
        </DrawerHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="p-4 space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
            ) : (
              <>
                {/* Purchase History */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Purchase History</h3>
                  {purchases.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No purchases found.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {purchases.map((p, i) => (
                        <Card key={i} className="border-0 shadow-sm">
                          <CardContent className="flex items-center justify-between p-3">
                            <div>
                              <p className="text-xs font-medium">
                                {format(new Date(p.date), "MMM d, yyyy")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {p.qty}× {p.pack_size ? `${p.pack_size}pk` : "1pk"} = {p.units} units
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold">{fmt(p.line_total)}</p>
                              {p.unit_cost != null && (
                                <p className="text-xs text-muted-foreground">
                                  {fmt(Number(p.unit_cost))}/unit
                                </p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Profit Breakdown */}
                <div>
                  <h3 className="text-sm font-semibold mb-2">Profit Breakdown</h3>
                  {purchases.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No data.</p>
                  ) : sku?.sell_price == null ? (
                    <p className="text-xs text-muted-foreground">No sell price set for this SKU.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {purchases.map((p, i) => (
                        <Card key={i} className="border-0 shadow-sm">
                          <CardContent className="flex items-center justify-between p-3">
                            <div>
                              <p className="text-xs font-medium">
                                {format(new Date(p.date), "MMM d, yyyy")}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Rev {p.revenue != null ? fmt(p.revenue) : "—"} · Cost {fmt(p.line_total)}
                              </p>
                            </div>
                            <p className={`text-sm font-bold ${
                              p.profit != null && p.profit >= 0 ? "text-primary" : "text-destructive"
                            }`}>
                              {p.profit != null ? `${p.profit >= 0 ? "+" : ""}${fmt(p.profit)}` : "—"}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* Summary */}
                {summary && (
                  <Card className="bg-primary/5 border-0">
                    <CardContent className="p-4 space-y-2">
                      <h3 className="text-sm font-semibold">Summary</h3>
                      <div className="grid grid-cols-2 gap-y-2 text-sm">
                        <span className="text-muted-foreground">Total Units</span>
                        <span className="text-right font-medium">{summary.total_units.toLocaleString()}</span>

                        <span className="text-muted-foreground">Avg Cost/Unit</span>
                        <span className="text-right font-medium">{fmt(summary.avg_cost_per_unit)}</span>

                        <span className="text-muted-foreground">Total Revenue</span>
                        <span className="text-right font-medium">{fmt(summary.total_revenue)}</span>

                        <span className="text-muted-foreground">Total Cost</span>
                        <span className="text-right font-medium">{fmt(summary.total_cost)}</span>

                        <span className="text-muted-foreground">Total Profit</span>
                        <span className={`text-right font-bold ${
                          summary.total_profit >= 0 ? "text-primary" : "text-destructive"
                        }`}>
                          {summary.total_profit >= 0 ? "+" : ""}{fmt(summary.total_profit)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
