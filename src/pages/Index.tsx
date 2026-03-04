import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, ShoppingCart, AlertTriangle, Tag } from "lucide-react";

export default function Index() {
  const { user, session } = useAuth();

  // Seed SKUs on first visit
  useEffect(() => {
    if (!session) return;
    supabase.functions.invoke("seed-skus").catch(console.error);
  }, [session]);

  const statCards = [
    { label: "Business Spend", sublabel: "This Week", value: "$0.00", icon: ShoppingCart, color: "text-primary" },
    { label: "Personal Spend", sublabel: "This Week", value: "$0.00", icon: DollarSign, color: "text-muted-foreground" },
    { label: "Expected Profit", sublabel: "This Week", value: "$0.00", icon: TrendingUp, color: "text-primary" },
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
              <p className="text-lg font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
        <Badge variant="outline" className="gap-1 py-1.5 px-3">
          <AlertTriangle className="h-3 w-3" /> 0 Needs Review
        </Badge>
        <Badge variant="outline" className="gap-1 py-1.5 px-3">
          <Tag className="h-3 w-3" /> 0 Needs Price
        </Badge>
      </div>

      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Top 5 SKUs by Profit</h2>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Upload your first receipt to see profitability data.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
