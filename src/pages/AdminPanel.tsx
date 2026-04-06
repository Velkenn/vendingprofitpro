import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const ADMIN_EMAIL = "sdodd987@gmail.com";

interface UsageLog {
  id: string;
  user_id: string;
  feature_type: string;
  model_used: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  created_at: string;
}

interface CostSummary {
  today: number;
  week: number;
  month: number;
}

interface FeatureBreakdown {
  feature_type: string;
  total_cost: number;
  call_count: number;
  avg_cost: number;
}

export default function AdminPanel() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<UsageLog[]>([]);
  const [costs, setCosts] = useState<CostSummary>({ today: 0, week: 0, month: 0 });
  const [breakdown, setBreakdown] = useState<FeatureBreakdown[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user || user.email !== ADMIN_EMAIL) {
      navigate("/app", { replace: true });
      return;
    }
    fetchData();
  }, [user, loading]);

  async function fetchData() {
    setFetching(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [logsRes, todayRes, weekRes, monthRes] = await Promise.all([
      supabase.from("api_usage_logs").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("api_usage_logs").select("estimated_cost_usd").gte("created_at", todayStart),
      supabase.from("api_usage_logs").select("estimated_cost_usd").gte("created_at", weekStart),
      supabase.from("api_usage_logs").select("estimated_cost_usd, feature_type").gte("created_at", monthStart),
    ]);

    if (logsRes.data) setLogs(logsRes.data as UsageLog[]);

    const sumCosts = (data: any[]) => data.reduce((s, r) => s + Number(r.estimated_cost_usd || 0), 0);
    setCosts({
      today: sumCosts(todayRes.data || []),
      week: sumCosts(weekRes.data || []),
      month: sumCosts(monthRes.data || []),
    });

    // Build feature breakdown from month data
    if (monthRes.data) {
      const byFeature: Record<string, { total: number; count: number }> = {};
      for (const row of monthRes.data) {
        const ft = (row as any).feature_type;
        if (!byFeature[ft]) byFeature[ft] = { total: 0, count: 0 };
        byFeature[ft].total += Number(row.estimated_cost_usd || 0);
        byFeature[ft].count++;
      }
      setBreakdown(
        Object.entries(byFeature).map(([feature_type, d]) => ({
          feature_type,
          total_cost: d.total,
          call_count: d.count,
          avg_cost: d.count > 0 ? d.total / d.count : 0,
        }))
      );
    }

    setFetching(false);
  }

  if (loading || fetching) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  }

  const fmt = (n: number) => `$${n.toFixed(4)}`;

  return (
    <div className="px-4 pt-6 pb-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app/settings")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
      </div>

      {/* Cost Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {([["Today", costs.today], ["This Week", costs.week], ["This Month", costs.month]] as const).map(([label, val]) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-bold mt-1">{fmt(val)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feature Breakdown */}
      <Card className="border-0 shadow-sm mb-6">
        <CardContent className="p-4">
          <p className="font-medium text-sm mb-3">Cost by Feature (This Month)</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Feature</TableHead>
                <TableHead className="text-xs text-right">Calls</TableHead>
                <TableHead className="text-xs text-right">Total</TableHead>
                <TableHead className="text-xs text-right">Avg/Call</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.map((b) => (
                <TableRow key={b.feature_type}>
                  <TableCell className="text-xs">{b.feature_type}</TableCell>
                  <TableCell className="text-xs text-right">{b.call_count}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(b.total_cost)}</TableCell>
                  <TableCell className="text-xs text-right">{fmt(b.avg_cost)}</TableCell>
                </TableRow>
              ))}
              {breakdown.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-xs text-center text-muted-foreground">No data yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Logs */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="font-medium text-sm mb-3">Recent API Calls</p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Feature</TableHead>
                  <TableHead className="text-xs">Model</TableHead>
                  <TableHead className="text-xs text-right">In</TableHead>
                  <TableHead className="text-xs text-right">Out</TableHead>
                  <TableHead className="text-xs text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell className="text-xs">{log.feature_type}</TableCell>
                    <TableCell className="text-xs">{log.model_used.split("/").pop()}</TableCell>
                    <TableCell className="text-xs text-right">{log.input_tokens.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{log.output_tokens.toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{fmt(Number(log.estimated_cost_usd))}</TableCell>
                  </TableRow>
                ))}
                {logs.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-xs text-center text-muted-foreground">No logs yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
