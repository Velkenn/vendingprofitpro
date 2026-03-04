import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart } from "lucide-react";

export default function Purchases() {
  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Purchases</h1>

      <Tabs defaultValue="week">
        <TabsList className="w-full">
          <TabsTrigger value="week" className="flex-1">Week</TabsTrigger>
          <TabsTrigger value="month" className="flex-1">Month</TabsTrigger>
          <TabsTrigger value="year" className="flex-1">Year</TabsTrigger>
          <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
        </TabsList>
        {["week", "month", "year", "all"].map((tab) => (
          <TabsContent key={tab} value={tab}>
            <Card className="border-0 shadow-sm">
              <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                <ShoppingCart className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No purchase data yet.</p>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
