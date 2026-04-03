import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, Package, DollarSign, TrendingUp, Store, ChevronLeft, ChevronRight, Banknote, ChevronRight as ChevronRightIcon } from "lucide-react";
import { useSKUDetail } from "@/contexts/SKUDetailContext";
import type { Tables } from "@/integrations/supabase/types";
import { startOfWeek, startOfMonth, startOfYear, endOfWeek, endOfMonth, endOfYear, isAfter, isBefore, subWeeks, subMonths, subYears, format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getReceiptStatus } from "@/lib/receipt-status";

type ReceiptItemWithJoins = Tables<"receipt_items"> & {
  skus: Pick<Tables<"skus">, "sku_name" | "sell_price"> | null;
  receipts: Pick<Tables<"receipts">, "receipt_date" | "vendor" | "store_location">;
};

type SkuStats = {
  sku_id: string;
  sku_name: string;
  total_units: number;
  avg_unit_cost: number;
  profit_per_unit: number;
  total_spend: number;
  sell_price: number | null;
};

type BusinessMetrics = {
  total_spend: number;
  total_revenue: number;
  total_profit: number;
  avg_unit_cost: number;
  total_units: number;
};

type MachineSale = {
  id: string;
  date: string;
  cash_amount: number;
  credit_amount: number;
};

type StoreSpend = {
  store: string;
  total: number;
  percentage: number;
};

type TimeFilter = "week" | "month" | "year" | "lifetime" | "q1" | "q2" | "q3" | "q4";

export default function Stats() {
  const { user } = useAuth();
  const { openSKUDetail } = useSKUDetail();
  const navigate = useNavigate();
  const [items, setItems] = useState<ReceiptItemWithJoins[]>([]);
  const [machineSales, setMachineSales] = useState<MachineSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("lifetime");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [storeReceipts, setStoreReceipts] = useState<Tables<"receipts">[]>([]);
  const [storeReceiptsLoading, setStoreReceiptsLoading] = useState(false);

  useEffect(() => { setPeriodOffset(0); }, [timeFilter]);

  useEffect(() => {
    if (!user) return;
    
    Promise.all([
      supabase
        .from("receipt_items")
        .select(`
          *,
          skus(sku_name, sell_price),
          receipts!inner(receipt_date, vendor, store_location)
        `)
        .eq("is_personal", false),
      supabase
        .from("machine_sales")
        .select("id, date, cash_amount, credit_amount")
    ]).then(([itemsRes, salesRes]) => {
      setItems((itemsRes.data as ReceiptItemWithJoins[]) || []);
      setMachineSales((salesRes.data as MachineSale[]) || []);
      setLoading(false);
    });
  }, [user]);

  const getFilterRange = (filter: TimeFilter, offset: number): { start: Date; end: Date } | null => {
    if (filter === "lifetime") return null;
    const now = new Date();
    const currentYear = now.getFullYear();

    if (filter.startsWith("q")) {
      const quarterMap: Record<string, [number, number]> = {
        q1: [0, 2],
        q2: [3, 5],
        q3: [6, 8],
        q4: [9, 11],
      };
      const [startMonth, endMonth] = quarterMap[filter];
      const start = new Date(currentYear, startMonth, 1);
      const end = new Date(currentYear, endMonth + 1, 0, 23, 59, 59);
      return { start, end };
    }

    if (filter === "week") {
      const base = subWeeks(startOfWeek(now, { weekStartsOn: 0 }), -offset);
      return { start: base, end: endOfWeek(base, { weekStartsOn: 0 }) };
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
  };

  const getPeriodLabel = (filter: TimeFilter, offset: number): string => {
    const range = getFilterRange(filter, offset);
    if (!range) return "";
    if (filter === "week") {
      return `${format(range.start, "MMM d")}–${format(range.end, "MMM d, yyyy")}`;
    }
    if (filter === "month") {
      return format(range.start, "MMMM yyyy");
    }
    if (filter === "year") {
      return format(range.start, "yyyy");
    }
    return "";
  };

  const getStoreLabel = (item: ReceiptItemWithJoins): string => {
    const vendor = item.receipts.vendor;
    const displayName = vendor === "sams" ? "Sam's Club" : vendor === "walmart" ? "Walmart" : (item.receipts.store_location || "Unknown Store");
    const sName = vendor === "sams" ? "Sam's Club" : vendor === "walmart" ? "Walmart" : displayName.split(",")[0]?.trim() || "Unknown Store";
    const city = item.receipts.store_location ? extractCity(item.receipts.store_location) : null;
    return city ? `${sName} — ${city}` : sName;
  };

  const handleStoreClick = async (storeLabel: string) => {
    setSelectedStore(storeLabel);
    setStoreReceiptsLoading(true);
    // Find matching receipt IDs from filtered items
    const matchingReceiptIds = new Set<string>();
    filteredItems.forEach(item => {
      if (getStoreLabel(item) === storeLabel) matchingReceiptIds.add(item.receipt_id);
    });
    if (matchingReceiptIds.size > 0) {
      const { data } = await supabase
        .from("receipts")
        .select("*")
        .in("id", Array.from(matchingReceiptIds))
        .order("receipt_date", { ascending: false });
      setStoreReceipts(data || []);
    } else {
      setStoreReceipts([]);
    }
    setStoreReceiptsLoading(false);
  };


    const range = getFilterRange(timeFilter, periodOffset);
    if (!range) return items;
    return items.filter(item => {
      const d = new Date(item.receipts.receipt_date);
      return !isBefore(d, range.start) && !isAfter(d, range.end);
    });
  };

  const calculateSkuStats = (filteredItems: ReceiptItemWithJoins[]): SkuStats[] => {
    const groups = new Map<string, {
      sku_name: string;
      units: number[];
      costs: number[];
      total_spend: number;
      sell_price: number | null;
    }>();

    filteredItems.forEach(item => {
      if (!item.sku_id || !item.skus) return;
      const units = (item.qty || 1) * (item.pack_size || 1);
      
      if (!groups.has(item.sku_id)) {
        groups.set(item.sku_id, {
          sku_name: item.skus.sku_name,
          units: [],
          costs: [],
          total_spend: 0,
          sell_price: item.skus.sell_price,
        });
      }
      
      const group = groups.get(item.sku_id)!;
      group.units.push(units);
      group.costs.push(item.unit_cost || 0);
      group.total_spend += item.line_total;
    });

    return Array.from(groups.entries())
      .map(([sku_id, group]) => {
        const total_units = group.units.reduce((sum, u) => sum + u, 0);
        const avg_unit_cost = total_units > 0 ? group.total_spend / total_units : 0;
        const profit_per_unit = group.sell_price ? group.sell_price - avg_unit_cost : 0;
        return { sku_id, sku_name: group.sku_name, total_units, avg_unit_cost, profit_per_unit, total_spend: group.total_spend, sell_price: group.sell_price };
      })
      .sort((a, b) => b.total_units - a.total_units);
  };

  const calculateBusinessMetrics = (filteredItems: ReceiptItemWithJoins[], filteredSales: MachineSale[]): BusinessMetrics => {
    let total_spend = 0, total_units = 0;
    filteredItems.forEach(item => {
      const units = (item.qty || 1) * (item.pack_size || 1);
      total_spend += item.line_total;
      total_units += units;
    });
    const total_revenue = filteredSales.reduce((sum, s) => sum + Number(s.cash_amount) + Number(s.credit_amount), 0);
    const total_profit = total_revenue - total_spend;
    return { total_spend, total_revenue, total_profit, avg_unit_cost: total_units > 0 ? total_spend / total_units : 0, total_units };
  };

  const extractCity = (location: string): string | null => {
    // Try pattern: "..., City, ST ZIP" or "..., City, ST"
    const parts = location.split(",").map(s => s.trim());
    for (let i = parts.length - 1; i >= 0; i--) {
      // Match "TX 75069" or "TX" — state abbreviation pattern
      if (/^[A-Z]{2}(\s+\d{5}(-\d{4})?)?$/.test(parts[i]) && i > 0) {
        const city = parts[i - 1].replace(/^\d+\s/, ""); // strip leading numbers
        if (city && !/^\d/.test(city) && city.length > 1) {
          return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
        }
      }
    }
    // Fallback: look for a segment that looks like a city name (not an address with numbers)
    for (let i = parts.length - 1; i >= 0; i--) {
      const seg = parts[i];
      if (seg && !/\d/.test(seg) && seg.length > 1 && !/^[A-Z]{2}$/.test(seg)) {
        return seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase();
      }
    }
    return null;
  };

  const calculateStoreSpend = (filteredItems: ReceiptItemWithJoins[]): StoreSpend[] => {
    // First pass: collect spend per storeName and track city frequencies
    const storeCitySpend = new Map<string, Map<string, number>>(); // storeName -> city -> spend
    const storeNoCitySpend = new Map<string, number>(); // storeName -> spend with no city
    let grandTotal = 0;

    filteredItems.forEach(item => {
      const vendor = item.receipts.vendor;
      const storeName = vendor === "sams" ? "Sam's Club" : vendor === "walmart" ? "Walmart" : (item.receipts.store_location?.split(",")[0]?.replace(/\d+\s*\w*\s*(DR|ST|AVE|BLVD|RD|LN|CT|WAY|PL|PKWY)\b.*/i, "").trim() || "Unknown Store");
      const cleanStoreName = storeName.replace(/^(Sam's Club|Walmart)\s*/i, "").trim() ? 
        (vendor === "sams" ? "Sam's Club" : vendor === "walmart" ? "Walmart" : storeName) : storeName;
      const finalName = vendor === "sams" ? "Sam's Club" : vendor === "walmart" ? "Walmart" : (item.receipts.store_location || "Unknown Store").split(",")[0]?.trim() || "Unknown Store";
      
      const displayName = vendor === "sams" ? "Sam's Club" : vendor === "walmart" ? "Walmart" : (item.receipts.store_location || "Unknown Store");
      const city = item.receipts.store_location ? extractCity(item.receipts.store_location) : null;
      const sName = vendor === "sams" ? "Sam's Club" : vendor === "walmart" ? "Walmart" : displayName.split(",")[0]?.trim() || "Unknown Store";

      grandTotal += item.line_total;

      if (city) {
        if (!storeCitySpend.has(sName)) storeCitySpend.set(sName, new Map());
        const cityMap = storeCitySpend.get(sName)!;
        cityMap.set(city, (cityMap.get(city) || 0) + item.line_total);
      } else {
        storeNoCitySpend.set(sName, (storeNoCitySpend.get(sName) || 0) + item.line_total);
      }
    });

    // Assign no-city spend to the most-visited city for that store
    storeNoCitySpend.forEach((spend, sName) => {
      const cityMap = storeCitySpend.get(sName);
      if (cityMap && cityMap.size > 0) {
        // Find most-visited city
        let topCity = "";
        let topSpend = 0;
        cityMap.forEach((s, c) => { if (s > topSpend) { topCity = c; topSpend = s; } });
        cityMap.set(topCity, (cityMap.get(topCity) || 0) + spend);
      } else {
        // No city data at all — just use store name alone
        if (!storeCitySpend.has(sName)) storeCitySpend.set(sName, new Map());
        const cityMap = storeCitySpend.get(sName)!;
        cityMap.set("", (cityMap.get("") || 0) + spend);
      }
    });

    const results: StoreSpend[] = [];
    storeCitySpend.forEach((cityMap, sName) => {
      cityMap.forEach((total, city) => {
        const label = city ? `${sName} — ${city}` : sName;
        results.push({ store: label, total, percentage: grandTotal > 0 ? (total / grandTotal) * 100 : 0 });
      });
    });

    return results.sort((a, b) => b.total - a.total);
  };

  if (loading) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight mb-4">Stats</h1>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const filteredItems = getFilteredItems();
  const filteredSales = (() => {
    const range = getFilterRange(timeFilter, periodOffset);
    if (!range) return machineSales;
    return machineSales.filter(s => {
      const d = new Date(s.date);
      return !isBefore(d, range.start) && !isAfter(d, range.end);
    });
  })();
  const skuStats = calculateSkuStats(filteredItems);
  const metrics = calculateBusinessMetrics(filteredItems, filteredSales);
  const storeSpend = calculateStoreSpend(filteredItems);
  const showNavigation = !["lifetime", "q1", "q2", "q3", "q4"].includes(timeFilter);

  const timeButtons: { value: TimeFilter; label: string }[] = [
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
    { value: "year", label: "Year" },
    { value: "lifetime", label: "Lifetime" },
  ];

  const quarterButtons: { value: TimeFilter; label: string }[] = [
    { value: "q1", label: "Jan–Mar" },
    { value: "q2", label: "Apr–Jun" },
    { value: "q3", label: "Jul–Sep" },
    { value: "q4", label: "Oct–Dec" },
  ];

  return (
    <div className="px-4 pt-6 pb-24 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Business Stats</h1>
      </div>

      {/* Time Filters */}
      <div className="space-y-2">
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
          {timeButtons.map(btn => (
            <button
              key={btn.value}
              onClick={() => setTimeFilter(btn.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                timeFilter === btn.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
          {quarterButtons.map(btn => (
            <button
              key={btn.value}
              onClick={() => setTimeFilter(btn.value)}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                timeFilter === btn.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
        {/* Period Navigation */}
        {showNavigation && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPeriodOffset(o => o - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[160px] text-center">
              {getPeriodLabel(timeFilter, periodOffset)}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={periodOffset >= 0} onClick={() => setPeriodOffset(o => o + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">${metrics.total_spend.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Business purchases</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">${metrics.total_revenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Machine sales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className={`text-2xl font-bold ${metrics.total_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.total_profit >= 0 ? '' : '-'}${Math.abs(metrics.total_profit).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Revenue − spend</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">Avg Unit Cost</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">${metrics.avg_unit_cost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Per unit purchased</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">Total Units</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{metrics.total_units.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Units purchased</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
            <CardTitle className="text-sm font-medium">Avg Profit Margin</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className={`text-2xl font-bold ${metrics.total_revenue > 0 ? (metrics.total_profit >= 0 ? 'text-green-600' : 'text-red-600') : ''}`}>
              {metrics.total_revenue > 0 ? `${((metrics.total_profit / metrics.total_revenue) * 100).toFixed(1)}%` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">Profit ÷ revenue</p>
          </CardContent>
        </Card>
      </div>

      {/* Store Spend Breakdown */}
      <Card>
        <CardHeader className="pb-1">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Spend by Store</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {storeSpend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No data for this period.</p>
          ) : (
            <div className="space-y-3">
              {storeSpend.map(s => (
                <div key={s.store} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.store}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">${s.total.toFixed(2)}</span>
                      <Badge variant="secondary" className="text-xs">{s.percentage.toFixed(1)}%</Badge>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${s.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SKU Leaderboard */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-lg">SKU Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {skuStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No business purchases found for this period.</p>
          ) : (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-1">
                {skuStats.map((sku, index) => (
                  <div key={sku.sku_id} className="flex items-center justify-between py-2 px-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Badge variant={index < 10 ? "default" : "secondary"} className="w-7 h-7 rounded-full flex items-center justify-center text-xs">
                        {index + 1}
                      </Badge>
                      <div>
                        <p className="font-medium text-sm leading-tight cursor-pointer underline decoration-dotted" onClick={() => openSKUDetail(sku.sku_id)}>{sku.sku_name}</p>
                        <p className="text-xs text-muted-foreground">{sku.total_units.toLocaleString()} units</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">${sku.avg_unit_cost.toFixed(2)}/unit</p>
                      <p className={`text-xs ${sku.profit_per_unit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {sku.profit_per_unit >= 0 ? '+' : ''}${sku.profit_per_unit.toFixed(2)} profit
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
