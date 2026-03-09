import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Package, Edit2, Trash2, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type Sku = Tables<"skus">;
type RebuyStatus = "Rebuy" | "Test" | "Do Not Rebuy" | "Core" | "Failed";

interface EditForm {
  sku_name: string;
  sell_price: string;
  category: string;
  rebuy_status: RebuyStatus;
  default_is_personal: boolean;
}

export default function SKUs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [skus, setSkus] = useState<Sku[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("skus")
      .select("*")
      .order("sku_name")
      .then(({ data }) => {
        setSkus(data || []);
        setLoading(false);
      });
  }, [user]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setShowCategoryDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const categories = [...new Set(skus.map((s) => s.category).filter(Boolean))] as string[];

  const filtered = skus.filter((s) =>
    s.sku_name.toLowerCase().includes(search.toLowerCase())
  );

  const rebuyColor = (s: string) => {
    if (s === "Rebuy") return "bg-primary/10 text-primary";
    if (s === "Core") return "bg-chart-2/10 text-chart-2";
    if (s === "Do Not Rebuy") return "bg-destructive/10 text-destructive";
    if (s === "Failed") return "bg-destructive/10 text-destructive";
    return "bg-accent/10 text-accent";
  };

  const startEdit = (sku: Sku) => {
    setEditingId(sku.id);
    setEditForm({
      sku_name: sku.sku_name,
      sell_price: sku.sell_price != null ? String(sku.sell_price) : "",
      category: sku.category || "",
      rebuy_status: sku.rebuy_status as RebuyStatus,
      default_is_personal: sku.default_is_personal,
    });
    setCategorySearch(sku.category || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const saveEdit = async (id: string) => {
    if (!editForm) return;
    setSaving(true);
    const { error } = await supabase
      .from("skus")
      .update({
        sku_name: editForm.sku_name.trim(),
        sell_price: editForm.sell_price ? parseFloat(editForm.sell_price) : null,
        category: editForm.category.trim() || null,
        rebuy_status: editForm.rebuy_status,
        default_is_personal: editForm.default_is_personal,
      })
      .eq("id", id);

    if (error) {
      toast({ title: "Error saving SKU", description: error.message, variant: "destructive" });
    } else {
      setSkus((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                sku_name: editForm.sku_name.trim(),
                sell_price: editForm.sell_price ? parseFloat(editForm.sell_price) : null,
                category: editForm.category.trim() || null,
                rebuy_status: editForm.rebuy_status,
                default_is_personal: editForm.default_is_personal,
              }
            : s
        )
      );
      setEditingId(null);
      setEditForm(null);
      toast({ title: "SKU updated" });
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    // Unlink receipt_items first
    await supabase
      .from("receipt_items")
      .update({ sku_id: null, needs_review: true })
      .eq("sku_id", deleteId);

    const { error } = await supabase.from("skus").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Error deleting SKU", description: error.message, variant: "destructive" });
    } else {
      setSkus((prev) => prev.filter((s) => s.id !== deleteId));
      toast({ title: "SKU deleted", description: "Linked items returned to review queue." });
    }
    setDeleting(false);
    setDeleteId(null);
  };

  const filteredCategories = categories.filter((c) =>
    c.toLowerCase().includes(categorySearch.toLowerCase())
  );

  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">SKU Master</h1>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search SKUs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Package className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {search ? "No SKUs match your search." : "No SKUs yet. They'll be created when you upload receipts."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 pb-24">
          {filtered.map((sku) =>
            editingId === sku.id && editForm ? (
              <Card key={sku.id} className="border-0 shadow-sm">
                <CardContent className="p-4 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">SKU Name</Label>
                    <Input
                      value={editForm.sku_name}
                      onChange={(e) => setEditForm({ ...editForm, sku_name: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Sell Price</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={editForm.sell_price}
                        onChange={(e) => setEditForm({ ...editForm, sell_price: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Rebuy Status</Label>
                      <Select
                        value={editForm.rebuy_status}
                        onValueChange={(v) => setEditForm({ ...editForm, rebuy_status: v as RebuyStatus })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Rebuy">Rebuy</SelectItem>
                          <SelectItem value="Core">Core</SelectItem>
                          <SelectItem value="Test">Test</SelectItem>
                          <SelectItem value="Failed">Failed</SelectItem>
                          <SelectItem value="Do Not Rebuy">Do Not Rebuy</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1" ref={categoryRef}>
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <div className="relative">
                      <Input
                        placeholder="Type or select category..."
                        value={categorySearch}
                        onChange={(e) => {
                          setCategorySearch(e.target.value);
                          setEditForm({ ...editForm, category: e.target.value });
                          setShowCategoryDropdown(true);
                        }}
                        onFocus={() => setShowCategoryDropdown(true)}
                      />
                      {showCategoryDropdown && filteredCategories.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                          {filteredCategories.map((cat) => (
                            <button
                              key={cat}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setEditForm({ ...editForm, category: cat });
                                setCategorySearch(cat);
                                setShowCategoryDropdown(false);
                              }}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      id={`personal-${sku.id}`}
                      checked={editForm.default_is_personal}
                      onCheckedChange={(v) => setEditForm({ ...editForm, default_is_personal: v })}
                    />
                    <Label htmlFor={`personal-${sku.id}`} className="text-sm">
                      Default Personal
                    </Label>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => saveEdit(sku.id)} disabled={saving}>
                      <Check className="h-3 w-3 mr-1" />
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={cancelEdit}>
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card key={sku.id} className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{sku.sku_name}</p>
                    <p className="text-xs text-muted-foreground">{sku.category || "Uncategorized"}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1 shrink-0">
                    <p className="font-bold text-sm">
                      {sku.sell_price != null ? `$${Number(sku.sell_price).toFixed(2)}` : "—"}
                    </p>
                    <Badge variant="secondary" className={`text-xs ${rebuyColor(sku.rebuy_status)}`}>
                      {sku.rebuy_status}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0 ml-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => startEdit(sku)}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(sku.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SKU?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the SKU. Any linked receipt items will be returned to the review queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
