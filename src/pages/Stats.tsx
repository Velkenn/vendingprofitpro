import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, Package, DollarSign, TrendingUp } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { startOfWeek, startOfMonth, startOfYear, isAfter } from "date-fns";

type ReceiptItemWithJoins = Tables<"receipt_items"> & {
  skus: Pick<Tables<"skus">, "sku_name" | "sell_price"> | null;
  receipts: Pick<Tables<"receipts">, "receipt_date">;
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
  total_profit: number;
  avg_unit_cost: number;
  avg_unit_profit: number;
  total_units: number;
};

type TimeFilter = "week" | "month" | "year" | "lifetime";

export default function Stats() {
  const { user } = useAuth();
  const [items, setItems] = useState<ReceiptItemWithJoins[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("lifetime");

  useEffect(() => {
    if (!user) return;
    
    supabase
      .from("receipt_items")
      .select(`
        *,
        skus(sku_name, sell_price),
        receipts!inner(receipt_date)
      `)
      .eq("is_personal", false)
      .then(({ data }) => {
        setItems((data as ReceiptItemWithJoins[]) || []);
        setLoading(false);
      });
  }, [user]);

  const getFilteredItems = (filter: TimeFilter): ReceiptItemWithJoins[] => {
    if (filter === "lifetime") return items;
    
    const now = new Date();
    let cutoff: Date;
    
    switch (filter) {
      case "week":
        cutoff = startOfWeek(now, { weekStartsOn: 0 });
        break;
      case "month":
        cutoff = startOfMonth(now);
        break;
      case "year":
        cutoff = startOfYear(now);
        break;
    }
    
    return items.filter(item => isAfter(new Date(item.receipts.receipt_date), cutoff));
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
      const cost = item.unit_cost || 0;
      
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
      group.costs.push(cost);
      group.total_spend += item.line_total;
    });

    return Array.from(groups.entries())
      .map(([sku_id, group]) => {
        const total_units = group.units.reduce((sum, units) => sum + units, 0);
        const avg_unit_cost = total_units > 0 ? group.total_spend / total_units : 0;
        const profit_per_unit = group.sell_price ? group.sell_price - avg_unit_cost : 0;
        
        return {
          sku_id,
          sku_name: group.sku_name,
          total_units,
          avg_unit_cost,
          profit_per_unit,
          total_spend: group.total_spend,
          sell_price: group.sell_price,
        };
      })
      .sort((a, b) => b.total_units - a.total_units);
  };

  const calculateBusinessMetrics = (filteredItems: ReceiptItemWithJoins[]): BusinessMetrics => {
    let total_spend = 0;
    let total_profit = 0;
    let total_units = 0;
    let total_cost = 0;

    filteredItems.forEach(item => {
      const units = (item.qty || 1) * (item.pack_size || 1);
      const unit_cost = item.unit_cost || 0;
      const sell_price = item.skus?.sell_price || 0;
      
      total_spend += item.line_total;
      total_units += units;
      total_cost += unit_cost * units;
      
      if (sell_price > 0) {
        total_profit += (sell_price - unit_cost) * units;
      }
    });

    return {
      total_spend,
      total_profit,
      avg_unit_cost: total_units > 0 ? total_cost / total_units : 0,
      avg_unit_profit: total_units > 0 ? total_profit / total_units : 0,
      total_units,
    };
  };

  if (loading) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold tracking-tight mb-4">Stats</h1>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const filteredItems = getFilteredItems(timeFilter);
  const skuStats = calculateSkuStats(filteredItems);
  const metrics = calculateBusinessMetrics(filteredItems);

  return (
    <div className="px-4 pt-6 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Business Stats</h1>
      </div>

      {/* Time Filter Tabs */}
      <Tabs value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
          <TabsTrigger value="lifetime">Lifetime</TabsTrigger>
        </TabsList>

        <TabsContent value={timeFilter} className="space-y-4">
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
                <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="text-2xl font-bold">${metrics.total_profit.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">Estimated profit</p>
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
          </div>

          {/* SKU Leaderboard */}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-lg">SKU Performance</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {skuStats.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No business purchases found for this period.
                </p>
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
                            <p className="font-medium text-sm leading-tight">{sku.sku_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {sku.total_units.toLocaleString()} units
                            </p>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}