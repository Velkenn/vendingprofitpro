import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

export default function CostTrends() {
  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Cost Trends</h1>
      <Card className="border-0 shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Upload receipts to see cost trends over time.</p>
        </CardContent>
      </Card>
    </div>
  );
}
