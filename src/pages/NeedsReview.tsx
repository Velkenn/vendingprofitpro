import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

export default function NeedsReview() {
  const { user } = useAuth();
  const [items, setItems] = useState<Tables<"receipt_items">[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("receipt_items")
      .select("*")
      .eq("needs_review", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setItems(data || []);
        setLoading(false);
      });
  }, [user]);

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Needs Review</h1>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : items.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No items need review. Great!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <p className="font-medium text-sm">{item.raw_name}</p>
                <p className="text-xs text-muted-foreground">
                  Qty: {item.qty} · ${Number(item.line_total).toFixed(2)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
