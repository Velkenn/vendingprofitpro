import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload as UploadIcon, FileText, Loader2, CheckCircle, XCircle,
  DollarSign, TrendingDown, AlertTriangle, Tag, Trophy, BarChart3,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { startOfMonth, endOfMonth, format, addMonths, subMonths, isSameMonth } from "date-fns";
import { useSKUDetail } from "@/contexts/SKUDetailContext";

type UploadState = "idle" | "uploading" | "parsing" | "done" | "error";

interface BottomSku {
  skuId: string;
  skuName: string;
  profit: number;
  maxAbsProfit: number;
}

export default function Index() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openSKUDetail } = useSKUDetail();
  const fileRef = useRef<HTMLInputElement>(null);

  // Dashboard data
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalSpend, setTotalSpend] = useState(0);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [needsPriceCount, setNeedsPriceCount] = useState(0);
  const [bottomSkus, setBottomSkus] = useState<BottomSku[]>([]);
  const [unitsPurchased, setUnitsPurchased] = useState(0);
  const [avgMargin, setAvgMargin] = useState(0);
  const [bestMachine, setBestMachine] = useState("");
  const [loading, setLoading] = useState(true);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadReceipt, setUploadReceipt] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [parseProgress, setParseProgress] = useState(0);
  const [parseLabel, setParseLabel] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Month navigation
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  // Log Sales sheet
  const [salesOpen, setSalesOpen] = useState(false);
  const [machines, setMachines] = useState<{ id: string; name: string }[]>([]);
  const [selectedMachine, setSelectedMachine] = useState("");
  const [saleDate, setSaleDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saleCash, setSaleCash] = useState("");
  const [saleCredit, setSaleCredit] = useState("");
  const [saleSaving, setSaleSaving] = useState(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const totalProfit = totalRevenue - totalSpend;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  // Load dashboard data
  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const monthStart = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(selectedMonth), "yyyy-MM-dd");

    // Parallel fetches
    const [receiptRes, salesRes, machineRes, reviewRes, priceRes] = await Promise.all([
      // This month's receipts → items
      supabase.from("receipts").select("id").gte("receipt_date", monthStart).lte("receipt_date", monthEnd),
      // This month's machine sales
      supabase.from("machine_sales").select("id, machine_id, cash_amount, credit_amount").gte("date", monthStart).lte("date", monthEnd),
      // All machines
      supabase.from("machines").select("id, name"),
      // Needs review count
      supabase.from("receipt_items").select("id", { count: "exact", head: true }).eq("needs_review", true),
      // Needs price count
      supabase.from("skus").select("id", { count: "exact", head: true }).is("sell_price", null).eq("default_is_personal", false),
    ]);

    setNeedsReviewCount(reviewRes.count || 0);
    setNeedsPriceCount(priceRes.count || 0);
    setMachines((machineRes.data || []).map(m => ({ id: m.id, name: m.name })));

    // Revenue from machine sales
    const sales = salesRes.data || [];
    const rev = sales.reduce((s, r) => s + Number(r.cash_amount) + Number(r.credit_amount), 0);
    setTotalRevenue(rev);

    // Best machine
    const machineRevMap = new Map<string, number>();
    for (const s of sales) {
      machineRevMap.set(s.machine_id, (machineRevMap.get(s.machine_id) || 0) + Number(s.cash_amount) + Number(s.credit_amount));
    }
    let bestId = "";
    let bestRev = 0;
    for (const [mid, mrev] of machineRevMap) {
      if (mrev > bestRev) { bestRev = mrev; bestId = mid; }
    }
    const bestM = (machineRes.data || []).find(m => m.id === bestId);
    setBestMachine(bestM?.name || "—");

    // Spend from receipt items this month
    const receiptIds = (receiptRes.data || []).map(r => r.id);
    let items: any[] = [];
    if (receiptIds.length > 0) {
      const { data } = await supabase
        .from("receipt_items")
        .select("line_total, qty, pack_size, sku_id, is_personal, skus(sell_price, sku_name)")
        .in("receipt_id", receiptIds)
        .eq("is_personal", false);
      items = data || [];
    }

    const spend = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
    setTotalSpend(spend);

    // Units purchased
    const units = items.reduce((s, i) => s + ((i.qty || 1) * (i.pack_size || 1)), 0);
    setUnitsPurchased(units);

    // Avg margin
    const profit = rev - spend;
    setAvgMargin(rev > 0 ? (profit / rev) * 100 : 0);

    // Bottom 8 SKUs by profit
    const skuMap = new Map<string, { skuName: string; skuId: string; revenue: number; cost: number }>();
    for (const item of items) {
      const sku = item.skus as any;
      if (!sku?.sell_price || !item.pack_size || !item.sku_id) continue;
      const id = item.sku_id;
      const entry = skuMap.get(id) || { skuName: sku.sku_name, skuId: id, revenue: 0, cost: 0 };
      entry.revenue += (item.qty || 1) * (item.pack_size || 1) * Number(sku.sell_price);
      entry.cost += Number(item.line_total) || 0;
      skuMap.set(id, entry);
    }

    const ranked = Array.from(skuMap.values())
      .map(s => ({ skuId: s.skuId, skuName: s.skuName, profit: s.revenue - s.cost, maxAbsProfit: 0 }))
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 8);

    const maxAbs = Math.max(...ranked.map(r => Math.abs(r.profit)), 1);
    for (const r of ranked) r.maxAbsProfit = maxAbs;
    setBottomSkus(ranked);

    setLoading(false);
  }, [user, selectedMonth]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  // Upload logic
  const startProgressAnimation = useCallback(() => {
    setParseProgress(0);
    setParseLabel("Uploading complete");
    const startTime = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      let progress: number, label: string;
      if (elapsed < 3) { progress = (elapsed / 3) * 30; label = "Uploading complete"; }
      else if (elapsed < 8) { progress = 30 + ((elapsed - 3) / 5) * 30; label = "Extracting text..."; }
      else if (elapsed < 18) { progress = 60 + ((elapsed - 8) / 10) * 25; label = "Analyzing items..."; }
      else if (elapsed < 33) { progress = 85 + ((elapsed - 18) / 15) * 10; label = "Almost done..."; }
      else { progress = 95; label = "Almost done..."; }
      setParseProgress(Math.min(progress, 95));
      setParseLabel(label);
    }, 200);
  }, []);

  const pollReceipt = useCallback((receiptId: string) => {
    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from("receipts").select("*").eq("id", receiptId).single();
      if (data && data.parse_status !== "PENDING") {
        stopPolling();
        setUploadReceipt(data);
        if (data.parse_status === "FAILED") {
          setUploadState("error");
          setErrorMsg("Could not read this receipt. Try a clearer scan.");
        } else {
          setParseProgress(100);
          setParseLabel("Complete!");
          setUploadState("done");
          loadDashboard();
        }
      }
    }, 2000);
  }, [stopPolling, loadDashboard]);

  const handleUpload = async (selectedFile: File) => {
    if (!selectedFile || !user) return;
    setUploadState("uploading");
    setErrorMsg("");
    try {
      const filePath = `${user.id}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage.from("receipts").upload(filePath, selectedFile);
      if (uploadError) throw uploadError;

      const { data: newReceipt, error: dbError } = await supabase
        .from("receipts")
        .insert({
          user_id: user.id,
          vendor: "sams" as const,
          receipt_date: new Date().toISOString().split("T")[0],
          parse_status: "PENDING" as const,
          pdf_url: filePath,
        })
        .select()
        .single();
      if (dbError) throw dbError;

      setUploadReceipt(newReceipt);
      startProgressAnimation();
      setUploadState("parsing");
      supabase.functions.invoke("parse-receipt", { body: { receipt_id: newReceipt.id, file_path: filePath } });
      pollReceipt(newReceipt.id);
    } catch (err: any) {
      setUploadState("error");
      setErrorMsg(err.message);
    }
  };

  const handleUploadReset = () => {
    stopPolling();
    setFile(null);
    setUploadReceipt(null);
    setUploadState("idle");
    setErrorMsg("");
    setParseProgress(0);
    setParseLabel("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); handleUpload(f); }
  };

  // Log Sale
  const handleSaveSale = async () => {
    if (!user || !selectedMachine || saleSaving) return;
    setSaleSaving(true);
    await supabase.from("machine_sales").insert({
      user_id: user.id,
      machine_id: selectedMachine,
      date: saleDate,
      cash_amount: Number(saleCash) || 0,
      credit_amount: Number(saleCredit) || 0,
    });
    setSaleSaving(false);
    setSalesOpen(false);
    setSaleCash("");
    setSaleCredit("");
    setSelectedMachine("");
    loadDashboard();
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const hasAlerts = needsReviewCount > 0 || needsPriceCount > 0;

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      {/* Greeting */}
      <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>

      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <p className="text-sm font-semibold">{format(selectedMonth, "MMMM yyyy")}</p>
        <Button
          variant="ghost"
          size="icon"
          disabled={isSameMonth(selectedMonth, new Date())}
          onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Hero Profit Card */}
      <Card className="border-0 shadow-md bg-gradient-to-br from-primary/10 to-primary/5">
        <CardContent className="p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{format(selectedMonth, "MMMM")} Profit</p>
          <p className={`text-4xl font-bold ${totalProfit >= 0 ? "text-primary" : "text-destructive"}`}>
            {loading ? "—" : fmt(totalProfit)}
          </p>
          <div className="flex gap-6 mt-3">
            <div>
              <p className="text-xs text-muted-foreground">Revenue</p>
              <p className="text-sm font-semibold">{loading ? "—" : fmt(totalRevenue)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Spend</p>
              <p className="text-sm font-semibold">{loading ? "—" : fmt(totalSpend)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Progress (inline, replaces action buttons while active) */}
      {uploadState !== "idle" && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            {uploadState === "uploading" && (
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="font-medium text-sm">Uploading...</p>
              </div>
            )}
            {uploadState === "parsing" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">{parseLabel}</p>
                  <span className="text-xs text-muted-foreground">{Math.round(parseProgress)}%</span>
                </div>
                <Progress value={parseProgress} className="h-2" />
              </div>
            )}
            {uploadState === "done" && uploadReceipt && (
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Receipt processed!</p>
                  <p className="text-xs text-muted-foreground">
                    {uploadReceipt.item_count ? `${uploadReceipt.item_count} items` : "Items extracted"}
                    {uploadReceipt.total ? ` · ${fmt(Number(uploadReceipt.total))}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleUploadReset}>New</Button>
                  <Button size="sm" onClick={() => navigate(`/app/receipts/${uploadReceipt.id}`)}>View</Button>
                </div>
              </div>
            )}
            {uploadState === "error" && (
              <div className="flex items-center gap-3">
                <XCircle className="h-5 w-5 text-destructive" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Error</p>
                  <p className="text-xs text-muted-foreground">{errorMsg}</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleUploadReset}>Retry</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      {uploadState === "idle" && (
        <div className="grid grid-cols-2 gap-3">
          <Button className="h-14 text-base gap-2" onClick={() => fileRef.current?.click()}>
            <UploadIcon className="h-5 w-5" /> Upload Receipt
          </Button>
          <Button variant="outline" className="h-14 text-base gap-2" onClick={() => setSalesOpen(true)}>
            <DollarSign className="h-5 w-5" /> Log Sales
          </Button>
        </div>
      )}

      <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />

      {/* Needs Attention - Bottom 8 SKUs */}
      {bottomSkus.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingDown className="h-4 w-4" /> Needs Attention
          </h2>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-2">
              {bottomSkus.map((sku) => {
                const pct = Math.abs(sku.profit) / sku.maxAbsProfit * 100;
                const isNeg = sku.profit < 0;
                return (
                  <div key={sku.skuId} className="flex items-center gap-2">
                    <p
                      className="text-xs w-28 truncate cursor-pointer underline decoration-dotted"
                      onClick={() => openSKUDetail(sku.skuId)}
                    >
                      {sku.skuName}
                    </p>
                    <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isNeg ? "bg-destructive/70" : "bg-accent/70"}`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                    <p className={`text-xs font-semibold w-16 text-right ${isNeg ? "text-destructive" : "text-muted-foreground"}`}>
                      {isNeg ? "-" : "+"}{fmt(Math.abs(sku.profit))}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Compact Stat Row */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold">{loading ? "—" : unitsPurchased.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Units Purchased</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold">{loading ? "—" : `${avgMargin.toFixed(1)}%`}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Avg Margin</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold truncate">{loading ? "—" : (bestMachine || "—")}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Best Machine</p>
          </CardContent>
        </Card>
      </div>

      {/* Inline Alerts */}
      {hasAlerts && (
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3 space-y-2">
            {needsReviewCount > 0 && (
              <div
                className="flex items-center gap-2 cursor-pointer rounded-lg p-2 hover:bg-muted/50 transition-colors"
                onClick={() => navigate("/app/needs-review")}
              >
                <AlertTriangle className="h-4 w-4 text-accent" />
                <p className="text-sm flex-1">{needsReviewCount} items need review</p>
                <Badge variant="secondary" className="text-xs">{needsReviewCount}</Badge>
              </div>
            )}
            {needsPriceCount > 0 && (
              <div
                className="flex items-center gap-2 cursor-pointer rounded-lg p-2 hover:bg-muted/50 transition-colors"
                onClick={() => navigate("/app/needs-price")}
              >
                <Tag className="h-4 w-4 text-accent" />
                <p className="text-sm flex-1">{needsPriceCount} SKUs need a price</p>
                <Badge variant="secondary" className="text-xs">{needsPriceCount}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Log Sales Bottom Sheet */}
      <Sheet open={salesOpen} onOpenChange={setSalesOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Log Sales</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Machine</Label>
              <Select value={selectedMachine} onValueChange={setSelectedMachine}>
                <SelectTrigger><SelectValue placeholder="Select a machine" /></SelectTrigger>
                <SelectContent>
                  {machines.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedMachine && (
              <>
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cash</Label>
                    <Input type="number" inputMode="decimal" placeholder="0.00" value={saleCash} onChange={e => setSaleCash(e.target.value)} />
                  </div>
                  <div>
                    <Label>Credit</Label>
                    <Input type="number" inputMode="decimal" placeholder="0.00" value={saleCredit} onChange={e => setSaleCredit(e.target.value)} />
                  </div>
                </div>
                <Button className="w-full" onClick={handleSaveSale} disabled={saleSaving}>
                  {saleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </>
            )}
            {machines.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No machines yet. Add one in the Machines tab first.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
