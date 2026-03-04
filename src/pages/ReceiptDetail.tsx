import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";

export default function ReceiptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState<Tables<"receipts"> | null>(null);
  const [items, setItems] = useState<Tables<"receipt_items">[]>([]);

  useEffect(() => {
    if (!id) return;
    supabase.from("receipts").select("*").eq("id", id).single().then(({ data }) => setReceipt(data));
    supabase.from("receipt_items").select("*").eq("receipt_id", id).then(({ data }) => setItems(data || []));
  }, [id]);

  if (!receipt) return <div className="p-4 text-muted-foreground">Loading...</div>;

  return (
    <div className="px-4 pt-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3 gap-1 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <Card className="border-0 shadow-sm mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg capitalize">
              {receipt.vendor === "sams" ? "Sam's Club" : "Walmart"}
            </CardTitle>
            <Badge variant="secondary">{receipt.parse_status}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Date: {format(new Date(receipt.receipt_date), "MMM d, yyyy")}</p>
          {receipt.receipt_identifier && <p>ID: {receipt.receipt_identifier}</p>}
          {receipt.store_location && <p>Location: {receipt.store_location}</p>}
          <div className="flex gap-4 pt-2 font-medium">
            <span>Subtotal: ${Number(receipt.subtotal || 0).toFixed(2)}</span>
            <span>Tax: ${Number(receipt.tax || 0).toFixed(2)}</span>
            <span>Total: ${Number(receipt.total || 0).toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>

      <h2 className="mb-2 font-semibold">Line Items ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No items parsed yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="border-0 shadow-sm">
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.normalized_name || item.raw_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Qty: {item.qty}{item.pack_size ? ` × ${item.pack_size}pk` : ""} · Unit: ${Number(item.unit_cost || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm">${Number(item.line_total).toFixed(2)}</p>
                    {item.is_personal && <Badge variant="secondary" className="text-xs">Personal</Badge>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
