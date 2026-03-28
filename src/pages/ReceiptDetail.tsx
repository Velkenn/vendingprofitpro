import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useSKUDetail } from "@/contexts/SKUDetailContext";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { getReceiptStatus } from "@/lib/receipt-status";
import ReceiptAddItemForm from "@/components/receipt/ReceiptAddItemForm";
import ReceiptStatusBanner from "@/components/receipt/ReceiptStatusBanner";

export default function ReceiptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { openSKUDetail } = useSKUDetail();
  const [receipt, setReceipt] = useState<Tables<"receipts"> | null>(null);
  const [items, setItems] = useState<Tables<"receipt_items">[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = () => {
    if (!id) return;
    supabase.from("receipts").select("*").eq("id", id).single().then(({ data }) => setReceipt(data));
    supabase.from("receipt_items").select("*").eq("receipt_id", id).then(({ data }) => setItems(data || []));
  };

  useEffect(() => { loadData(); }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      if (receipt?.pdf_url) {
        const path = receipt.pdf_url.split("/receipts/")[1];
        if (path) await supabase.storage.from("receipts").remove([path]);
      }
      const { error } = await supabase.from("receipts").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Receipt deleted" });
      navigate("/receipts");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (!receipt) return <div className="p-4 text-muted-foreground">Loading...</div>;

  const status = getReceiptStatus(receipt.parse_status);
  const StatusIcon = status.icon;

  return (
    <div className="px-4 pt-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3 gap-1 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <ReceiptStatusBanner status={receipt.parse_status} />

      <Card className="border-0 shadow-sm mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg capitalize">
              {receipt.vendor === "sams" ? "Sam's Club" : "Walmart"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className={`text-xs gap-1 ${status.badgeClass}`}>
                <StatusIcon className={`h-3 w-3 ${status.animate ? "animate-spin" : ""}`} />
                {status.label}
              </Badge>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this receipt?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove the receipt and all its line items.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
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

      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Line Items ({items.length})</h2>
      </div>

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

      {/* Manual add item — always available */}
      <div className="mt-4 mb-6">
        {!showAddForm ? (
          <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4" /> Add Item
          </Button>
        ) : (
          <ReceiptAddItemForm
            receiptId={id!}
            onClose={() => setShowAddForm(false)}
            onAdded={loadData}
          />
        )}
      </div>
    </div>
  );
}
