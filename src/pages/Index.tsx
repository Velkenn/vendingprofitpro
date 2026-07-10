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
  Upload as UploadIcon, Loader2, CheckCircle, XCircle,
  DollarSign, TrendingUp, AlertTriangle, Tag, ChevronLeft, ChevronRight,
  CheckCircle2, Circle, MessageCircle, Cpu
} from "lucide-react";
import { startOfMonth, endOfMonth, format, addMonths, subMonths, isSameMonth } from "date-fns";
import { useSKUDetail } from "@/contexts/SKUDetailContext";

type UploadState = "idle" | "uploading" | "parsing" | "done" | "error";

interface MoverSku {
  skuId: string;
  skuName: string;
  profit: number;
}

const POLL_TIMEOUT_MS = 90_000;

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
  const [topLosers, setTopLosers] = useState<MoverSku[]>([]);
  const [topGainers, setTopGainers] = useState<MoverSku[]>([]);
  const [unitsPurchased, setUnitsPurchased] = useState(0);
  const [avgMargin, setAvgMargin] = useState(0);
  const [bestMachine, setBestMachine] = useState("");
  const [loading, setLoading] = useState(true);

  // First-run checklist counts
  const [machineCount, setMachineCount] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);

  // Upload state
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadReceipt, setUploadReceipt] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [parseProgress, setParseProgress] = useState(0);
  const [parseLabel, setParseLabel] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const totalProfit = totalRevenue - totalSpend;

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const monthStart = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(selectedMonth), "yyyy-MM-dd");

    const [receiptRes, salesRes, machineRes, reviewRes, priceRes, allReceiptRes, chatRes] = await Promise.all([
      supabase.from("receipts").select("id").gte("receipt_date", monthStart).lte("receipt_date", monthEnd),
      supabase.from("machine_sales").select("id, machine_id, cash_amount, credit_amount").gte("date", monthStart).lte("date", monthEnd),
      supabase.from("machines").select("id, name"),
      supabase.from("receipt_items").select("id", { count: "exact", head: true }).eq("needs_review", true),
      supabase.from("skus").select("id", { count: "exact", head: true }).is("sell_price", null).eq("default_is_personal", false),
      supabase.from("receipts").select("id", { count: "exact", head: true }),
      supabase.from("chip_memories").select("id", { count: "exact", head: true }),
    ]);

    setNeedsReviewCount(reviewRes.count || 0);
    setNeedsPriceCount(priceRes.count || 0);
    setMachines((machineRes.data || []).map(m => ({ id: m.id, name: m.name })));
    setMachineCount((machineRes.data || []).length);
    setReceiptCount(allReceiptRes.count || 0);
    setChatCount(chatRes.count || 0);

    const sales = salesRes.data || [];
    const rev = sales.reduce((s, r) => s + Number(r.cash_amount) + Number(r.credit_amount), 0);
    setTotalRevenue(rev);

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

    const receiptIds = (receiptRes.data || []).map(r => r.id);
    let items: any[] = [];
    if (receiptIds.length > 0) {
      const { data } = await supabase
        .from("receipt_items")
        .select("line_total, qty, pack_size, sku_id, is_personal, skus(sell_price, sku_name, default_is_personal)")
        .in("receipt_id", receiptIds)
        .eq("is_personal", false);
      items = (data || []).filter(i => !(i.skus as any)?.default_is_personal);
    }

    const spend = items.reduce((s, i) => s + (Number(i.line_total) || 0), 0);
    setTotalSpend(spend);

    const units = items.reduce((s, i) => s + ((i.qty || 1) * (i.pack_size || 1)), 0);
    setUnitsPurchased(units);

    const profit = rev - spend;
    setAvgMargin(rev > 0 ? (profit / rev) * 100 : 0);

    // Top movers: est profit if all units sell
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
      .map(s => ({ skuId: s.skuId, skuName: s.skuName, profit: s.revenue - s.cost }))
      .sort((a, b) => a.profit - b.profit);
    setTopLosers(ranked.slice(0, 5));
    setTopGainers(ranked.slice(-3).reverse());

    setLoading(false);
  }, [user, selectedMonth]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

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
    timeoutRef.current = setTimeout(() => {
      stopPolling();
      setUploadState("error");
      setErrorMsg("This is taking longer than expected — check the Receipts tab.");
    }, POLL_TIMEOUT_MS);
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
          vendor: "other" as const,
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
      pollReceipt(newReceipt.id);

      // Capture the invoke result so real errors surface instead of hanging at 95%
      supabase.functions
        .invoke("parse-receipt", { body: { receipt_id: newReceipt.id, file_path: filePath } })
        .then(async ({ error }) => {
          if (!error) return;
          let message = error.message || "Receipt parsing failed";
          const response = (error as any)?.context;
          if (response && typeof response.clone === "function") {
            try {
              const body = await response.clone().json();
              if (body?.error) message = body.error;
            } catch { /* keep default */ }
          }
          stopPolling();
          setUploadState("error");
          setErrorMsg(message);
        })
        .catch((err: any) => {
          stopPolling();
          setUploadState("error");
          setErrorMsg(err?.message || "Receipt parsing failed");
        });
    } catch (err: any) {
      setUploadState("error");
      setErrorMsg(err.message);
    }
  };

  const handleUploadReset = () => {
    stopPolling();
    setUploadReceipt(null);
    setUploadState("idle");
    setErrorMsg("");
    setParseProgress(0);
    setParseLabel("");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleUpload(f);
    e.target.value = "";
  };

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
  const isFirstRun = !loading && machineCount === 0 && receiptCount === 0 && chatCount === 0;

  // First-run checklist
  if (isFirstRun) {
    return (
      <div className="px-4 pt-6 pb-4 space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
        <p className="text-sm text-muted-foreground">Let's get you set up in three steps.</p>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4 space-y-3">
            <ChecklistStep done={machineCount > 0} label="Add a machine" icon={Cpu} onClick={() => navigate("/app/machines")} />
            <ChecklistStep done={receiptCount > 0} label="Upload your first receipt" icon={UploadIcon} onClick={() => fileRef.current?.click()} />
            <ChecklistStep done={chatCount > 0} label="Ask Chip a question" icon={MessageCircle} onClick={() => navigate("/app/chat")} />
          </CardContent>
        </Card>
        <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
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

      {/* Action Buttons — directly under hero */}
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

      {/* Upload Progress */}
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

      <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />

      {/* Top Movers */}
      {(topLosers.length > 0 || topGainers.length > 0) && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4" /> Top Movers
          </h2>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <p className="text-[11px] text-muted-foreground italic">Est. profit if all units sell</p>
              {topGainers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">Top 3 gainers</p>
                  {topGainers.map(s => <MoverRow key={s.skuId} sku={s} onClick={() => openSKUDetail(s.skuId)} />)}
                </div>
              )}
              {topLosers.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-destructive uppercase tracking-wider">Bottom 5 losers</p>
                  {topLosers.map(s => <MoverRow key={s.skuId} sku={s} onClick={() => openSKUDetail(s.skuId)} />)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Consolidated Summary */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-2">
          <div className="grid grid-cols-3 gap-3 pb-2 border-b">
            <SummaryStat label="Units purchased" value={loading ? "—" : unitsPurchased.toLocaleString()} />
            <SummaryStat label="Avg margin" value={loading ? "—" : `${avgMargin.toFixed(1)}%`} />
            <SummaryStat label="Best machine" value={loading ? "—" : (bestMachine || "—")} />
          </div>
          {needsReviewCount > 0 && (
            <button
              className="flex items-center gap-2 w-full rounded-lg p-2 hover:bg-muted/50 transition-colors text-left"
              onClick={() => navigate("/app/needs-review")}
            >
              <AlertTriangle className="h-4 w-4 text-accent shrink-0" />
              <p className="text-sm flex-1">{needsReviewCount} items need review</p>
              <Badge variant="secondary" className="text-xs">{needsReviewCount}</Badge>
            </button>
          )}
          {needsPriceCount > 0 && (
            <button
              className="flex items-center gap-2 w-full rounded-lg p-2 hover:bg-muted/50 transition-colors text-left"
              onClick={() => navigate("/app/needs-price")}
            >
              <Tag className="h-4 w-4 text-accent shrink-0" />
              <p className="text-sm flex-1">{needsPriceCount} SKUs need a price</p>
              <Badge variant="secondary" className="text-xs">{needsPriceCount}</Badge>
            </button>
          )}
        </CardContent>
      </Card>

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

function MoverRow({ sku, onClick }: { sku: MoverSku; onClick: () => void }) {
  const isNeg = sku.profit < 0;
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  return (
    <div className="flex items-center gap-2">
      <p
        className="text-xs flex-1 truncate cursor-pointer underline decoration-dotted"
        onClick={onClick}
      >
        {sku.skuName}
      </p>
      <p className={`text-xs font-semibold w-16 text-right ${isNeg ? "text-destructive" : "text-primary"}`}>
        {isNeg ? "-" : "+"}{fmt(Math.abs(sku.profit))}
      </p>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-base font-bold truncate">{value}</p>
      <p className="text-xs text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

function ChecklistStep({
  done, label, icon: Icon, onClick,
}: {
  done: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  return (
    <button
      className="flex items-center gap-3 w-full rounded-lg p-3 hover:bg-muted/50 transition-colors text-left"
      onClick={onClick}
    >
      {done ? (
        <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
      ) : (
        <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
      )}
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <p className={`text-sm flex-1 ${done ? "line-through text-muted-foreground" : "font-medium"}`}>{label}</p>
      {!done && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
    </button>
  );
}
