import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, X, Plus, User, CheckCheck } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useSKUDetail } from "@/contexts/SKUDetailContext";
import type { Tables } from "@/integrations/supabase/types";

interface NewSkuForm {
  sku_name: string;
  sell_price: string;
  category: string;
}

export default function NeedsReview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { openSKUDetail } = useSKUDetail();
  const [items, setItems] = useState<Tables<"receipt_items">[]>([]);
  const [skus, setSkus] = useState<Tables<"skus">[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Per-item sell-price entries (keyed by item id)
  const [prices, setPrices] = useState<Record<string, string>>({});

  // Edit-mode expansion
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    normalized_name: "",
    sku_id: "",
    is_personal: false,
    qty: 1,
    pack_size: "",
    line_total: "",
  });
  const [skuSearch, setSkuSearch] = useState("");
  const [showCreateSku, setShowCreateSku] = useState(false);
  const [newSkuForm, setNewSkuForm] = useState<NewSkuForm>({ sku_name: "", sell_price: "", category: "" });
  const [creatingSku, setCreatingSku] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Approve-all dialog
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("receipt_items").select("*").eq("needs_review", true).order("created_at", { ascending: false }),
      supabase.from("skus").select("*").order("sku_name"),
    ]).then(([itemsRes, skusRes]) => {
      const its = itemsRes.data || [];
      setItems(its);
      const sks = skusRes.data || [];
      setSkus(sks);

      // Pre-fill sell prices from matched SKUs
      const skuMap = new Map(sks.map(s => [s.id, s]));
      const initial: Record<string, string> = {};
      for (const it of its) {
        if (it.sku_id) {
          const sku = skuMap.get(it.sku_id);
          if (sku?.sell_price != null) initial[it.id] = String(sku.sell_price);
        }
      }
      setPrices(initial);
      setLoading(false);
    });
  }, [user]);

  const skuById = useMemo(() => new Map(skus.map(s => [s.id, s])), [skus]);

  const persistSellPrice = async (skuId: string, price: number) => {
    const sku = skuById.get(skuId);
    if (!sku) return;
    if (sku.sell_price == null || Number(sku.sell_price) !== price) {
      await supabase.from("skus").update({ sell_price: price }).eq("id", skuId);
      setSkus(prev => prev.map(s => s.id === skuId ? { ...s, sell_price: price } : s));
    }
  };

  const quickApprove = async (item: Tables<"receipt_items">) => {
    setSavingId(item.id);
    const priceStr = prices[item.id];
    const parsedPrice = priceStr ? parseFloat(priceStr) : NaN;

    const { error } = await supabase
      .from("receipt_items")
      .update({ needs_review: false })
      .eq("id", item.id);

    if (!error && item.sku_id && !isNaN(parsedPrice)) {
      await persistSellPrice(item.sku_id, parsedPrice);
    }
    setSavingId(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setItems(prev => prev.filter(i => i.id !== item.id));
    toast({ title: "Approved" });
  };

  const markPersonal = async (item: Tables<"receipt_items">) => {
    setSavingId(item.id);
    const { error } = await supabase
      .from("receipt_items")
      .update({ is_personal: true, needs_review: false })
      .eq("id", item.id);

    if (!error && item.sku_id) {
      await supabase.from("skus").update({ default_is_personal: true }).eq("id", item.sku_id);
      setSkus(prev => prev.map(s => s.id === item.sku_id ? { ...s, default_is_personal: true } : s));
    }
    setSavingId(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setItems(prev => prev.filter(i => i.id !== item.id));
    toast({ title: "Marked personal" });
  };

  const openEdit = (item: Tables<"receipt_items">) => {
    setEditingId(item.id);
    setForm({
      normalized_name: item.normalized_name || item.raw_name,
      sku_id: item.sku_id || "",
      is_personal: item.is_personal,
      qty: item.qty,
      pack_size: item.pack_size?.toString() || "",
      line_total: Number(item.line_total).toFixed(2),
    });
    const matched = item.sku_id ? skuById.get(item.sku_id) : null;
    setSkuSearch(matched?.sku_name || item.normalized_name || item.raw_name);
    setShowCreateSku(false);
  };

  const autoFillPackSize = async (skuId: string) => {
    const { data } = await supabase
      .from("receipt_items")
      .select("pack_size")
      .eq("sku_id", skuId)
      .not("pack_size", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0 && data[0].pack_size) {
      setForm(prev => ({ ...prev, pack_size: data[0].pack_size!.toString() }));
    }
  };

  const selectSku = (sku: Tables<"skus">) => {
    setForm(prev => ({ ...prev, sku_id: sku.id }));
    setSkuSearch(sku.sku_name);
    autoFillPackSize(sku.id);
  };

  const handleCreateSku = async () => {
    if (!user || !newSkuForm.sku_name.trim()) return;
    setCreatingSku(true);
    const { data, error } = await supabase
      .from("skus")
      .insert({
        sku_name: newSkuForm.sku_name.trim(),
        sell_price: newSkuForm.sell_price ? parseFloat(newSkuForm.sell_price) : null,
        category: newSkuForm.category.trim() || null,
        user_id: user.id,
      })
      .select()
      .single();
    setCreatingSku(false);
    if (error) {
      toast({ title: "Error creating SKU", description: error.message, variant: "destructive" });
      return;
    }
    setSkus(prev => [...prev, data].sort((a, b) => a.sku_name.localeCompare(b.sku_name)));
    selectSku(data);
    setShowCreateSku(false);
    toast({ title: "SKU created" });
  };

  const handleFullApprove = async (id: string) => {
    setSavingId(id);
    const { error } = await supabase
      .from("receipt_items")
      .update({
        normalized_name: form.normalized_name || null,
        sku_id: form.sku_id || null,
        is_personal: form.is_personal,
        qty: form.qty,
        pack_size: form.pack_size ? parseInt(form.pack_size) : null,
        line_total: parseFloat(form.line_total),
        needs_review: false,
      })
      .eq("id", id);
    setSavingId(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    if (form.is_personal && form.sku_id) {
      await supabase.from("skus").update({ default_is_personal: true }).eq("id", form.sku_id);
    }
    setItems(prev => prev.filter(i => i.id !== id));
    setEditingId(null);
    toast({ title: "Approved" });
  };

  const approveAll = async () => {
    setBulkSaving(true);
    for (const item of items) {
      const priceStr = prices[item.id];
      const parsedPrice = priceStr ? parseFloat(priceStr) : NaN;
      await supabase.from("receipt_items").update({ needs_review: false }).eq("id", item.id);
      if (item.sku_id && !isNaN(parsedPrice)) {
        await persistSellPrice(item.sku_id, parsedPrice);
      }
    }
    setBulkSaving(false);
    setApproveAllOpen(false);
    setItems([]);
    toast({ title: `Approved ${items.length} items` });
  };

  const filteredSkus = skuSearch
    ? skus.filter(s => s.sku_name.toLowerCase().includes(skuSearch.toLowerCase()))
    : skus;
  const exactMatch = skuSearch
    ? skus.some(s => s.sku_name.toLowerCase() === skuSearch.toLowerCase())
    : true;

  const categories = [...new Set(skus.map(s => s.category).filter(Boolean))] as string[];
  const filteredCategories = categorySearch
    ? categories.filter(c => c.toLowerCase().includes(categorySearch.toLowerCase()))
    : categories;

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Needs Review</h1>
        {items.length > 0 && (
          <Badge variant="destructive" className="text-xs">{items.length}</Badge>
        )}
      </div>

      {items.length > 1 && !loading && (
        <div className="sticky top-0 z-10 -mx-4 px-4 py-2 mb-3 bg-background/95 backdrop-blur border-b">
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2"
            onClick={() => setApproveAllOpen(true)}
          >
            <CheckCheck className="h-4 w-4" /> Approve All ({items.length})
          </Button>
        </div>
      )}

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
          {items.map(item => {
            const matched = item.sku_id ? skuById.get(item.sku_id) : null;
            const guess = item.normalized_name || matched?.sku_name || item.raw_name;
            const isEditing = editingId === item.id;
            const isSaving = savingId === item.id;

            return (
              <Card key={item.id} className="border-0 shadow-sm">
                <CardContent className="p-3 space-y-2">
                  {/* Compact summary */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-medium text-sm truncate ${matched ? "cursor-pointer underline decoration-dotted" : ""}`}
                        onClick={() => matched && openSKUDetail(matched.id)}
                      >
                        {guess}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        Qty {item.qty}{item.pack_size ? ` · Pack ${item.pack_size}` : ""} · ${Number(item.line_total).toFixed(2)}
                      </p>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Sell $"
                      className="w-20 h-8 text-sm shrink-0"
                      value={prices[item.id] || ""}
                      onChange={e => setPrices(p => ({ ...p, [item.id]: e.target.value }))}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={isSaving}
                      onClick={() => quickApprove(item)}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={isSaving}
                      onClick={() => markPersonal(item)}
                    >
                      <User className="h-4 w-4 mr-1" />
                      Personal
                    </Button>
                  </div>

                  {!isEditing ? (
                    <button
                      className="text-xs text-muted-foreground underline decoration-dotted"
                      onClick={() => openEdit(item)}
                    >
                      Edit details
                    </button>
                  ) : (
                    <div className="mt-2 space-y-3 pt-3 border-t">
                      <div>
                        <Label className="text-xs">Normalized Name</Label>
                        <Input
                          value={form.normalized_name}
                          onChange={e => setForm({ ...form, normalized_name: e.target.value })}
                          className="mt-1 h-9 text-sm"
                        />
                      </div>

                      <div>
                        <Label className="text-xs">SKU Mapping</Label>
                        <Input
                          placeholder="Search SKUs..."
                          value={skuSearch}
                          onChange={e => { setSkuSearch(e.target.value); setShowCreateSku(false); }}
                          className="mt-1 h-9 text-sm"
                        />
                        {(skuSearch || !form.sku_id) && (
                          <div className="mt-1 max-h-40 overflow-y-auto rounded border bg-popover">
                            {filteredSkus.slice(0, 20).map(sku => (
                              <button
                                key={sku.id}
                                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-accent ${form.sku_id === sku.id ? "bg-accent font-medium" : ""}`}
                                onClick={() => selectSku(sku)}
                              >
                                {sku.sku_name}
                              </button>
                            ))}
                            {skuSearch.trim() && !exactMatch && !showCreateSku && (
                              <button
                                className="w-full px-3 py-1.5 text-left text-sm font-medium text-primary hover:bg-accent flex items-center gap-1"
                                onClick={() => {
                                  setShowCreateSku(true);
                                  setNewSkuForm({ sku_name: skuSearch.trim(), sell_price: "", category: "" });
                                  setCategorySearch("");
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Create "{skuSearch.trim()}"
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {showCreateSku && (
                        <Card className="border shadow-sm">
                          <CardContent className="p-3 space-y-2">
                            <p className="text-xs font-medium">New SKU</p>
                            <div>
                              <Label className="text-xs">Name</Label>
                              <Input value={newSkuForm.sku_name} onChange={e => setNewSkuForm({ ...newSkuForm, sku_name: e.target.value })} className="mt-1 h-8 text-sm" />
                            </div>
                            <div>
                              <Label className="text-xs">Sell Price</Label>
                              <Input type="number" step="0.01" placeholder="0.00" value={newSkuForm.sell_price} onChange={e => setNewSkuForm({ ...newSkuForm, sell_price: e.target.value })} className="mt-1 h-8 text-sm" />
                            </div>
                            <div>
                              <Label className="text-xs">Category</Label>
                              <Input
                                placeholder="Search or type category..."
                                value={categorySearch}
                                onChange={e => { setCategorySearch(e.target.value); setNewSkuForm({ ...newSkuForm, category: e.target.value }); setShowCategoryDropdown(true); }}
                                onFocus={() => setShowCategoryDropdown(true)}
                                className="mt-1 h-8 text-sm"
                              />
                              {showCategoryDropdown && filteredCategories.length > 0 && (
                                <div className="mt-1 max-h-32 overflow-y-auto rounded border bg-popover">
                                  {filteredCategories.slice(0, 10).map(cat => (
                                    <button
                                      key={cat}
                                      className={`w-full px-3 py-1.5 text-left text-sm hover:bg-accent ${newSkuForm.category === cat ? "bg-accent font-medium" : ""}`}
                                      onClick={() => { setNewSkuForm({ ...newSkuForm, category: cat }); setCategorySearch(cat); setShowCategoryDropdown(false); }}
                                    >
                                      {cat}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 pt-1">
                              <Button size="sm" onClick={handleCreateSku} disabled={creatingSku || !newSkuForm.sku_name.trim()} className="flex-1">
                                {creatingSku ? "Creating..." : "Create & Select"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setShowCreateSku(false)}>Cancel</Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Qty</Label>
                          <Input type="number" value={form.qty} onChange={e => setForm({ ...form, qty: parseInt(e.target.value) || 1 })} className="mt-1 h-9 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Pack Size</Label>
                          <Input type="number" value={form.pack_size} onChange={e => setForm({ ...form, pack_size: e.target.value })} className="mt-1 h-9 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Total</Label>
                          <Input type="number" step="0.01" value={form.line_total} onChange={e => setForm({ ...form, line_total: e.target.value })} className="mt-1 h-9 text-sm" />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Switch checked={form.is_personal} onCheckedChange={v => setForm({ ...form, is_personal: v })} />
                        <Label className="text-xs">Personal item</Label>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => handleFullApprove(item.id)} disabled={isSaving} className="flex-1">
                          <Check className="mr-1 h-4 w-4" />
                          {isSaving ? "Saving..." : "Save Changes"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="flex-1">
                          <X className="mr-1 h-4 w-4" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={approveAllOpen} onOpenChange={setApproveAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve all {items.length} items?</AlertDialogTitle>
            <AlertDialogDescription>
              Each item will be approved with its current values. Any sell prices you've entered will update the linked SKUs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={approveAll} disabled={bulkSaving}>
              {bulkSaving ? "Approving..." : "Approve All"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
