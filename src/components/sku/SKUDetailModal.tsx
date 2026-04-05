import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Pencil, Trash2, Save } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

interface PurchaseEntry {
  id: string;
  date: string;
  vendor: string;
  store_location: string | null;
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
  const { toast } = useToast();
  const [sku, setSku] = useState<Tables<"skus"> | null>(null);
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editPackSize, setEditPackSize] = useState("");
  const [editLineTotal, setEditLineTotal] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadData = () => {
    if (!skuId || !open) return;
    setLoading(true);
    setEditingId(null);

    Promise.all([
      supabase.from("skus").select("*").eq("id", skuId).single(),
      supabase
        .from("receipt_items")
        .select("id, qty, pack_size, unit_cost, line_total, receipts!inner(receipt_date, vendor, store_location)")
        .eq("sku_id", skuId)
        .order("created_at", { ascending: false }),
    ]).then(([skuRes, itemsRes]) => {
      const skuData = skuRes.data;
      setSku(skuData);

      const raw = (itemsRes.data || []) as unknown as Array<{
        id: string;
        qty: number;
        pack_size: number | null;
        unit_cost: number | null;
        line_total: number;
        receipts: { receipt_date: string; vendor: string; store_location: string | null };
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
          id: item.id,
          date: item.receipts.receipt_date,
          vendor: item.receipts.vendor,
          store_location: item.receipts.store_location,
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
  };

  useEffect(() => { loadData(); }, [skuId, open]);

  const startEdit = (p: PurchaseEntry) => {
    setEditingId(p.id);
    setEditQty(String(p.qty));
    setEditPackSize(p.pack_size != null ? String(p.pack_size) : "");
    setEditLineTotal(String(p.line_total));
  };

  const handleSave = async () => {
    if (!editingId) return;
    setEditSaving(true);
    const qty = parseInt(editQty) || 1;
    const pack_size = editPackSize ? parseInt(editPackSize) : null;
    const line_total = parseFloat(editLineTotal) || 0;
    const divisor = qty * (pack_size || 1);
    const unit_cost = divisor > 0 ? Math.round((line_total / divisor) * 100) / 100 : null;

    const { error } = await supabase
      .from("receipt_items")
      .update({ qty, pack_size, line_total, unit_cost })
      .eq("id", editingId);

    setEditSaving(false);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved" });
      loadData();
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    setEditSaving(true);
    const { error } = await supabase.from("receipt_items").delete().eq("id", editingId);
    setEditSaving(false);
    if (error) {
      toast({ title: "Error deleting", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted" });
      loadData();
    }
  };

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
          <Button variant="ghost" size="icon" className="absolute right-2 top-2 h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
          <DrawerTitle className="pr-8 text-base leading-snug">
            {sku?.sku_name || "Loading..."}
          </DrawerTitle>
          <DrawerDescription className="sr-only">SKU details and purchase history</DrawerDescription>
          {sku && (
            <div className="flex gap-2 mt-1">
              {sku.category && <Badge variant="outline" className="text-xs">{sku.category}</Badge>}
              <Badge variant="secondary" className={`text-xs ${rebuyColor(sku.rebuy_status)}`}>
                {sku.rebuy_status}
              </Badge>
              {sku.sell_price != null && (
                <Badge variant="outline" className="text-xs">Sell: {fmt(Number(sku.sell_price))}</Badge>
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
                      {purchases.map((p) => (
                        <Card key={p.id} className="border-0 shadow-sm">
                          <CardContent className="p-3">
                            {editingId === p.id ? (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground">
                                  {format(new Date(p.date), "MMM d, yyyy")}
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="text-xs text-muted-foreground">Qty</label>
                                    <Input className="h-8 text-sm" type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)} />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Pack Size</label>
                                    <Input className="h-8 text-sm" type="number" value={editPackSize} onChange={(e) => setEditPackSize(e.target.value)} placeholder="—" />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground">Total $</label>
                                    <Input className="h-8 text-sm" type="number" step="0.01" value={editLineTotal} onChange={(e) => setEditLineTotal(e.target.value)} />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button size="sm" className="flex-1 h-8 gap-1" onClick={handleSave} disabled={editSaving}>
                                    <Save className="h-3 w-3" /> Save
                                  </Button>
                                  <Button size="sm" variant="destructive" className="h-8 gap-1" onClick={handleDelete} disabled={editSaving}>
                                    <Trash2 className="h-3 w-3" /> Delete
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between cursor-pointer" onClick={() => startEdit(p)}>
                                <div>
                                  <p className="text-xs font-medium">
                                    {format(new Date(p.date), "MMM d, yyyy")}
                                    <span className="ml-1.5 font-normal text-muted-foreground">
                                      {p.store_location || (p.vendor === "sams" ? "Sam's Club" : p.vendor === "walmart" ? "Walmart" : "Other")}
                                    </span>
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {p.qty}× {p.pack_size ? `${p.pack_size}pk` : "1pk"} = {p.units} units
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-right">
                                    <p className="text-sm font-bold">{fmt(p.line_total)}</p>
                                    {p.unit_cost != null && (
                                      <p className="text-xs text-muted-foreground">{fmt(Number(p.unit_cost))}/unit</p>
                                    )}
                                  </div>
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                              </div>
                            )}
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
                      {purchases.map((p) => (
                        <Card key={p.id} className="border-0 shadow-sm">
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
