import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, ShoppingCart, AlertTriangle, Tag } from "lucide-react";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useSKUDetail } from "@/contexts/SKUDetailContext";

interface TopSku {
  skuId: string;
  skuName: string;
  revenue: number;
  cost: number;
  profit: number;
}

export default function Index() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openSKUDetail } = useSKUDetail();

  const [businessSpend, setBusinessSpend] = useState(0);
  const [personalSpend, setPersonalSpend] = useState(0);
  const [expectedProfit, setExpectedProfit] = useState(0);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [needsPriceCount, setNeedsPriceCount] = useState(0);
  const [topSkus, setTopSkus] = useState<TopSku[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Ensure user_settings exist
    await supabase.from("user_settings").upsert({
      user_id: user.id,
      week_start_day: 0,
    }, { onConflict: "user_id", ignoreDuplicates: true });

    // Get user's week_start_day
    const { data: settings } = await supabase
      .from("user_settings")
      .select("week_start_day")
      .eq("user_id", user.id)
      .maybeSingle();

    const weekStartDay = settings?.week_start_day ?? 0;
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
    const weekEnd = endOfWeek(now, { weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6 });
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    const weekEndStr = format(weekEnd, "yyyy-MM-dd");

    // Fetch this week's receipt IDs
    const { data: weekReceipts } = await supabase
      .from("receipts")
      .select("id")
      .gte("receipt_date", weekStartStr)
      .lte("receipt_date", weekEndStr);

    const weekReceiptIds = (weekReceipts || []).map((r) => r.id);

    // Fetch receipt items for this week with SKU data
    let weekItems: any[] = [];
    if (weekReceiptIds.length > 0) {
      const { data } = await supabase
        .from("receipt_items")
        .select("line_total, is_personal, qty, pack_size, sku_id, skus(sell_price, sku_name)")
        .in("receipt_id", weekReceiptIds);
      weekItems = data || [];
    }

    // Compute spend
    let bSpend = 0;
    let pSpend = 0;
    let profit = 0;
    for (const item of weekItems) {
      const total = Number(item.line_total) || 0;
      if (item.is_personal) {
        pSpend += total;
      } else {
        bSpend += total;
        const sku = item.skus as any;
        if (sku?.sell_price != null && item.pack_size) {
          const revenue = (item.qty || 1) * (item.pack_size || 1) * Number(sku.sell_price);
          profit += revenue - total;
        }
      }
    }
    setBusinessSpend(bSpend);
    setPersonalSpend(pSpend);
    setExpectedProfit(profit);

    // Needs Review count (all time)
    const { count: reviewCount } = await supabase
      .from("receipt_items")
      .select("id", { count: "exact", head: true })
      .eq("needs_review", true);
    setNeedsReviewCount(reviewCount || 0);

    // Needs Price count
    const { count: priceCount } = await supabase
      .from("skus")
      .select("id", { count: "exact", head: true })
      .is("sell_price", null)
      .eq("default_is_personal", false);
    setNeedsPriceCount(priceCount || 0);

    // Top 5 SKUs by profit (all time)
    const { data: allItems } = await supabase
      .from("receipt_items")
      .select("line_total, qty, pack_size, sku_id, is_personal, skus(sell_price, sku_name)")
      .eq("is_personal", false)
      .not("sku_id", "is", null);

    const skuMap = new Map<string, { skuName: string; skuId: string; revenue: number; cost: number }>();
    for (const item of allItems || []) {
      const sku = item.skus as any;
      if (!sku?.sell_price || !item.pack_size) continue;
      const id = item.sku_id!;
      const entry = skuMap.get(id) || { skuName: sku.sku_name, skuId: id, revenue: 0, cost: 0 };
      const rev = (item.qty || 1) * (item.pack_size || 1) * Number(sku.sell_price);
      entry.revenue += rev;
      entry.cost += Number(item.line_total) || 0;
      skuMap.set(id, entry);
    }

    const ranked = Array.from(skuMap.values())
      .map((s) => ({ ...s, profit: s.revenue - s.cost }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);
    setTopSkus(ranked);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  const statCards = [
    { label: "Business Spend", sublabel: "This Week", value: fmt(businessSpend), icon: ShoppingCart, color: "text-primary" },
    { label: "Personal Spend", sublabel: "This Week", value: fmt(personalSpend), icon: DollarSign, color: "text-muted-foreground" },
    { label: "Expected Profit", sublabel: "This Week", value: fmt(expectedProfit), icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="px-4 pt-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </p>
      </div>

      <div className="grid gap-3">
        {statCards.map((card) => (
          <Card key={card.label} className="border-0 shadow-sm">
            <CardContent className="flex items-center gap-4 p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ${card.color}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{card.label}</p>
                <p className="text-xs text-muted-foreground">{card.sublabel}</p>
              </div>
              <p className="text-lg font-bold">{loading ? "—" : card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <Badge
          variant="outline"
          className="gap-1 py-1.5 px-3 cursor-pointer"
          onClick={() => navigate("/needs-review")}
        >
          <AlertTriangle className="h-3 w-3" /> {needsReviewCount} Needs Review
        </Badge>
        <Badge
          variant="outline"
          className="gap-1 py-1.5 px-3 cursor-pointer"
          onClick={() => navigate("/needs-price")}
        >
          <Tag className="h-3 w-3" /> {needsPriceCount} Needs Price
        </Badge>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Top 5 SKUs by Profit</h2>
        {topSkus.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              Upload your first receipt to see profitability data.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {topSkus.map((sku, i) => (
              <Card key={i} className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate cursor-pointer underline decoration-dotted" onClick={() => openSKUDetail(sku.skuId)}>{sku.skuName}</p>
                    <p className="text-xs text-muted-foreground">
                      Rev {fmt(sku.revenue)} · Cost {fmt(sku.cost)}
                    </p>
                  </div>
                  <p className={`text-sm font-bold ${sku.profit >= 0 ? "text-primary" : "text-destructive"}`}>
                    {sku.profit >= 0 ? "+" : ""}{fmt(sku.profit)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
