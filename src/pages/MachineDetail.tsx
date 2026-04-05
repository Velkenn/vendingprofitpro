import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, ArrowLeft, Banknote, CreditCard, DollarSign, Download, Plus, Search, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { startOfWeek, startOfMonth, startOfYear, endOfWeek, endOfMonth, endOfYear, isAfter, isBefore, subWeeks, subMonths, subYears, format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { useSKUDetail } from "@/contexts/SKUDetailContext";
import type { Tables } from "@/integrations/supabase/types";

type TimeFilter = "week" | "month" | "year" | "lifetime";

type MachineSale = {
  id: string;
  machine_id: string;
  date: string;
  cash_amount: number;
  credit_amount: number;
};

type MachineSKU = {
  id: string;
  sku_id: string;
  skus: Pick<Tables<"skus">, "sku_name" | "sell_price"> | null;
};

const TIME_FILTERS: { value: TimeFilter; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "lifetime", label: "Lifetime" },
];

function getFilterRange(filter: TimeFilter, offset: number, weekStartsOn: 0|1|2|3|4|5|6 = 0): { start: Date; end: Date } | null {
  const now = new Date();
  if (filter === "week") {
    const base = subWeeks(startOfWeek(now, { weekStartsOn }), -offset);
    return { start: base, end: endOfWeek(base, { weekStartsOn }) };
  }
  if (filter === "month") {
    const base = subMonths(startOfMonth(now), -offset);
    return { start: base, end: endOfMonth(base) };
  }
  if (filter === "year") {
    const base = subYears(startOfYear(now), -offset);
    return { start: base, end: endOfYear(base) };
  }
  return null;
}

function getPeriodLabel(filter: TimeFilter, offset: number, weekStartsOn: 0|1|2|3|4|5|6 = 0): string {
  const range = getFilterRange(filter, offset, weekStartsOn);
  if (!range) return "";
  if (filter === "week") return `${format(range.start, "MMM d")}–${format(range.end, "MMM d, yyyy")}`;
  if (filter === "month") return format(range.start, "MMMM yyyy");
  if (filter === "year") return format(range.start, "yyyy");
  return "";
}

export default function MachineDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openSKUDetail } = useSKUDetail();
  const [machine, setMachine] = useState<{ id: string; name: string; location: string | null } | null>(null);
  const [sales, setSales] = useState<MachineSale[]>([]);
  const [machineSkus, setMachineSkus] = useState<MachineSKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("lifetime");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [weekStartDay, setWeekStartDay] = useState<0|1|2|3|4|5|6>(0);

  // Log sales dialog
  const [logOpen, setLogOpen] = useState(false);
  const [logDate, setLogDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [logCash, setLogCash] = useState("");
  const [logCredit, setLogCredit] = useState("");
  const [logSaving, setLogSaving] = useState(false);

  // Edit sale dialog
  const [editSale, setEditSale] = useState<MachineSale | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editCash, setEditCash] = useState("");
  const [editCredit, setEditCredit] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Add SKU dialog
  const [skuOpen, setSkuOpen] = useState(false);
  const [skuSearch, setSkuSearch] = useState("");
  const [allSkus, setAllSkus] = useState<Pick<Tables<"skus">, "id" | "sku_name">[]>([]);
  const [skuLoading, setSkuLoading] = useState(false);

  useEffect(() => { setPeriodOffset(0); }, [timeFilter]);

  const fetchData = async () => {
    if (!user || !id) return;
    setLoading(true);
    const [machineRes, salesRes, skusRes] = await Promise.all([
      supabase.from("machines").select("*").eq("id", id).eq("user_id", user.id).single(),
      supabase.from("machine_sales").select("*").eq("machine_id", id).eq("user_id", user.id).order("date", { ascending: false }),
      supabase.from("machine_skus").select("id, sku_id, skus(sku_name, sell_price)").eq("machine_id", id).eq("user_id", user.id),
    ]);
    setMachine(machineRes.data as any);
    setSales((salesRes.data as MachineSale[]) || []);
    setMachineSkus((skusRes.data as any) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user, id]);

  const range = getFilterRange(timeFilter, periodOffset);
  const filteredSales = sales.filter((s) => {
    if (!range) return true;
    const d = new Date(s.date);
    return !isBefore(d, range.start) && !isAfter(d, range.end);
  });

  const totalCash = filteredSales.reduce((s, e) => s + Number(e.cash_amount), 0);
  const totalCredit = filteredSales.reduce((s, e) => s + Number(e.credit_amount), 0);
  const totalRevenue = totalCash + totalCredit;
  const cashPct = totalRevenue > 0 ? Math.round((totalCash / totalRevenue) * 100) : 0;
  const creditPct = totalRevenue > 0 ? 100 - cashPct : 0;

  // Warning: no sales in 7 days
  const lastSaleDate = sales.length > 0 ? new Date(sales[0].date) : null;
  const showWarning = lastSaleDate ? differenceInDays(new Date(), lastSaleDate) > 7 : sales.length > 0;

  const handleLogSale = async () => {
    if (!user || !id) return;
    setLogSaving(true);
    const { error } = await supabase.from("machine_sales").insert({
      machine_id: id,
      user_id: user.id,
      date: logDate,
      cash_amount: parseFloat(logCash) || 0,
      credit_amount: parseFloat(logCredit) || 0,
    });
    setLogSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sale logged" });
      setLogOpen(false);
      setLogCash("");
      setLogCredit("");
      fetchData();
    }
  };

  const openEditSale = (sale: MachineSale) => {
    setEditSale(sale);
    setEditDate(sale.date);
    setEditCash(String(sale.cash_amount));
    setEditCredit(String(sale.credit_amount));
  };

  const handleEditSave = async () => {
    if (!editSale) return;
    setEditSaving(true);
    const { error } = await supabase.from("machine_sales").update({
      date: editDate,
      cash_amount: parseFloat(editCash) || 0,
      credit_amount: parseFloat(editCredit) || 0,
    }).eq("id", editSale.id);
    setEditSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sale updated" });
      setEditSale(null);
      fetchData();
    }
  };

  const handleEditDelete = async () => {
    if (!editSale) return;
    setEditSaving(true);
    const { error } = await supabase.from("machine_sales").delete().eq("id", editSale.id);
    setEditSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sale deleted" });
      setEditSale(null);
      fetchData();
    }
  };

  const handleSearchSkus = async () => {
    if (!user) return;
    setSkuLoading(true);
    let query = supabase.from("skus").select("id, sku_name").eq("user_id", user.id).limit(100);
    if (skuSearch.trim()) {
      query = query.ilike("sku_name", `%${skuSearch}%`);
    }
    const { data } = await query;
    setAllSkus(data || []);
    setSkuLoading(false);
  };

  useEffect(() => {
    if (skuOpen) handleSearchSkus();
  }, [skuOpen, skuSearch]);

  const linkedSkuIds = new Set(machineSkus.map((ms) => ms.sku_id));

  const handleAddSku = async (skuId: string) => {
    if (!user || !id) return;
    const { error } = await supabase.from("machine_skus").insert({
      machine_id: id,
      sku_id: skuId,
      user_id: user.id,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      fetchData();
    }
  };

  const handleRemoveSku = async (machineSkuId: string) => {
    const { error } = await supabase.from("machine_skus").delete().eq("id", machineSkuId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      fetchData();
    }
  };

  const handleExport = () => {
    const rows = [["Date", "Cash", "Credit", "Total"]];
    sales.forEach((s) => {
      const total = Number(s.cash_amount) + Number(s.credit_amount);
      rows.push([s.date, Number(s.cash_amount).toFixed(2), Number(s.credit_amount).toFixed(2), total.toFixed(2)]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${machine?.name || "machine"}-sales.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const showNavigation = timeFilter !== "lifetime";

  if (loading) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>;
  if (!machine) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Machine not found</div>;

  return (
    <div className="px-4 pt-4 pb-4 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/machines")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">{machine.name}</h1>
          {machine.location && <p className="text-xs text-muted-foreground">{machine.location}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
      </div>

      {/* Warning Banner */}
      {showWarning && sales.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          This machine has not been updated recently.
        </div>
      )}

      {/* Stats Card */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Revenue</CardTitle>
            <div className="flex gap-1">
              {TIME_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTimeFilter(f.value)}
                  className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                    timeFilter === f.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {/* Period Navigation */}
          {showNavigation && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPeriodOffset(o => o - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-medium min-w-[140px] text-center">
                {getPeriodLabel(timeFilter, periodOffset)}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={periodOffset >= 0} onClick={() => setPeriodOffset(o => o + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <Banknote className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">Cash</p>
              <p className="text-sm font-semibold">${totalCash.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <CreditCard className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">Credit</p>
              <p className="text-sm font-semibold">${totalCredit.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <DollarSign className="h-4 w-4 mx-auto text-primary mb-1" />
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-sm font-semibold">${totalRevenue.toFixed(2)}</p>
            </div>
          </div>
          {totalRevenue > 0 && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Cash {cashPct}%</span>
                <span>Credit {creditPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden flex">
                <div className="bg-primary h-full" style={{ width: `${cashPct}%` }} />
                <div className="bg-primary/50 h-full" style={{ width: `${creditPct}%` }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Sales Button */}
      <Button className="w-full" onClick={() => setLogOpen(true)}>
        <Plus className="h-4 w-4 mr-1" /> Log Sales Entry
      </Button>

      {/* Sales History */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium">Sales History</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {sales.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No sales entries yet.</p>
          ) : (
            <ScrollArea className="h-60">
              <div className="space-y-2 pr-3">
                {sales.map((s) => {
                  const total = Number(s.cash_amount) + Number(s.credit_amount);
                  return (
                    <button
                      key={s.id}
                      onClick={() => openEditSale(s)}
                      className="w-full flex items-center justify-between py-1.5 border-b border-border last:border-0 text-left hover:bg-muted/50 rounded px-1 transition-colors"
                    >
                      <div>
                        <p className="text-xs font-medium">{format(new Date(s.date), "MMM d, yyyy")}</p>
                        <p className="text-xs text-muted-foreground">
                          Cash: ${Number(s.cash_amount).toFixed(2)} · Credit: ${Number(s.credit_amount).toFixed(2)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold">${total.toFixed(2)}</p>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Products in this Machine */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Products in this Machine</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setSkuOpen(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {machineSkus.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No products linked yet.</p>
          ) : (
            <ScrollArea className="h-48">
              <div className="space-y-2 pr-3">
                {machineSkus.map((ms) => (
                  <div key={ms.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <button
                      onClick={() => openSKUDetail(ms.sku_id)}
                      className="text-xs font-medium text-left cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary"
                    >
                      {ms.skus?.sku_name || "Unknown SKU"}
                    </button>
                    <div className="flex items-center gap-2">
                      {ms.skus?.sell_price && (
                        <Badge variant="secondary" className="text-xs">${Number(ms.skus.sell_price).toFixed(2)}</Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => handleRemoveSku(ms.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Log Sales Dialog */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Sales Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
            </div>
            <div>
              <Label>Cash Amount ($)</Label>
              <Input type="number" step="0.01" min="0" value={logCash} onChange={(e) => setLogCash(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Credit Amount ($)</Label>
              <Input type="number" step="0.01" min="0" value={logCredit} onChange={(e) => setLogCredit(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleLogSale} disabled={logSaving}>
              {logSaving ? "Saving..." : "Log Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Sale Dialog */}
      <Dialog open={!!editSale} onOpenChange={(open) => { if (!open) setEditSale(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div>
              <Label>Cash Amount ($)</Label>
              <Input type="number" step="0.01" min="0" value={editCash} onChange={(e) => setEditCash(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Credit Amount ($)</Label>
              <Input type="number" step="0.01" min="0" value={editCredit} onChange={(e) => setEditCredit(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="destructive" onClick={handleEditDelete} disabled={editSaving}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add SKU Dialog */}
      <Dialog open={skuOpen} onOpenChange={setSkuOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search SKUs..."
                value={skuSearch}
                onChange={(e) => setSkuSearch(e.target.value)}
              />
            </div>
            <ScrollArea className="h-72">
              <div className="space-y-1 pr-3">
                {skuLoading ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
                ) : allSkus.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No SKUs found</p>
                ) : (
                  allSkus.map((sku) => {
                    const linked = linkedSkuIds.has(sku.id);
                    return (
                      <div key={sku.id} className="flex items-center justify-between py-1.5 px-1">
                        <span className="text-xs">{sku.sku_name}</span>
                        {linked ? (
                          <Badge variant="secondary" className="text-xs">Added</Badge>
                        ) : (
                          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => handleAddSku(sku.id)}>
                            Add
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
