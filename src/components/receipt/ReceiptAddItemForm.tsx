import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  receiptId: string;
  onClose: () => void;
  onAdded: () => void;
}

export default function ReceiptAddItemForm({ receiptId, onClose, onAdded }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ raw_name: "", qty: 1, pack_size: "", line_total: "" });

  const handleAdd = async () => {
    if (!user || !newItem.raw_name || !newItem.line_total) return;
    setAdding(true);
    try {
      const { error } = await supabase.from("receipt_items").insert({
        receipt_id: receiptId,
        user_id: user.id,
        raw_name: newItem.raw_name,
        qty: newItem.qty,
        pack_size: newItem.pack_size ? parseInt(newItem.pack_size) : null,
        line_total: parseFloat(newItem.line_total),
        needs_review: true,
      });
      if (error) throw error;
      setNewItem({ raw_name: "", qty: 1, pack_size: "", line_total: "" });
      onClose();
      onAdded();
      toast({ title: "Item added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Add Item</p>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
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
        <Button size="sm" className="w-full" onClick={handleAdd} disabled={adding || !newItem.raw_name || !newItem.line_total}>
          {adding ? "Adding..." : "Add Item"}
        </Button>
      </CardContent>
    </Card>
  );
}
