import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, AlertTriangle, Plus, X, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";

export default function ReceiptDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [receipt, setReceipt] = useState<Tables<"receipts"> | null>(null);
  const [items, setItems] = useState<Tables<"receipt_items">[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ raw_name: "", qty: 1, pack_size: "", line_total: "" });
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = () => {
    if (!id) return;
    supabase.from("receipts").select("*").eq("id", id).single().then(({ data }) => setReceipt(data));
    supabase.from("receipt_items").select("*").eq("receipt_id", id).then(({ data }) => setItems(data || []));
  };

  useEffect(() => { loadData(); }, [id]);

  const handleAddItem = async () => {
    if (!id || !user || !newItem.raw_name || !newItem.line_total) return;
    setAdding(true);
    try {
      const { error } = await supabase.from("receipt_items").insert({
        receipt_id: id,
        user_id: user.id,
        raw_name: newItem.raw_name,
        qty: newItem.qty,
        pack_size: newItem.pack_size ? parseInt(newItem.pack_size) : null,
        line_total: parseFloat(newItem.line_total),
        needs_review: true,
      });
      if (error) throw error;
      setNewItem({ raw_name: "", qty: 1, pack_size: "", line_total: "" });
      setShowAddForm(false);
      loadData();
      toast({ title: "Item added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      // Delete PDF from storage if exists
      if (receipt?.pdf_url) {
        const path = receipt.pdf_url.split("/receipts/")[1];
        if (path) await supabase.storage.from("receipts").remove([path]);
      }
      // Delete receipt row (receipt_items cascade via FK)
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

  const handleMarkParsed = async () => {
    if (!id) return;
    await supabase.from("receipts").update({ parse_status: "PARSED" }).eq("id", id);
    loadData();
    toast({ title: "Marked as fully parsed" });
  };

  if (!receipt) return <div className="p-4 text-muted-foreground">Loading...</div>;

  const isPartial = receipt.parse_status === "PARTIAL_PARSE";
  const itemCount = receipt.item_count || 0;

  return (
    <div className="px-4 pt-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-3 gap-1 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      {isPartial && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-destructive">
              {items.length} of {itemCount} items extracted
            </p>
            <p className="text-muted-foreground">Some items could not be parsed. You can add them manually below.</p>
          </div>
        </div>
      )}

      <Card className="border-0 shadow-sm mb-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg capitalize">
              {receipt.vendor === "sams" ? "Sam's Club" : "Walmart"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{receipt.parse_status}</Badge>
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
        {isPartial && items.length >= itemCount && (
          <Button size="sm" variant="outline" onClick={handleMarkParsed}>Mark Complete</Button>
        )}
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

      {/* Manual add missing item */}
      {isPartial && (
        <div className="mt-4 mb-6">
          {!showAddForm ? (
            <Button variant="outline" size="sm" className="w-full gap-1" onClick={() => setShowAddForm(true)}>
              <Plus className="h-4 w-4" /> Add Missing Item
            </Button>
          ) : (
            <Card className="border shadow-sm">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Add Item</p>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAddForm(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div>
                  <Label className="text-xs">Item Name</Label>
                  <Input
                    value={newItem.raw_name}
                    onChange={(e) => setNewItem({ ...newItem, raw_name: e.target.value })}
                    placeholder="e.g. Monster Energy 15pk"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Qty</Label>
                    <Input
                      type="number"
                      value={newItem.qty}
                      onChange={(e) => setNewItem({ ...newItem, qty: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Pack Size</Label>
                    <Input
                      type="number"
                      value={newItem.pack_size}
                      onChange={(e) => setNewItem({ ...newItem, pack_size: e.target.value })}
                      placeholder="e.g. 15"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Total $</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newItem.line_total}
                      onChange={(e) => setNewItem({ ...newItem, line_total: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={handleAddItem} disabled={adding || !newItem.raw_name || !newItem.line_total}>
                  {adding ? "Adding..." : "Add Item"}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
