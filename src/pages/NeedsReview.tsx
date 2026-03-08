import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, X, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

interface NewSkuForm {
  sku_name: string;
  sell_price: string;
  category: string;
}

export default function NeedsReview() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<Tables<"receipt_items">[]>([]);
  const [skus, setSkus] = useState<Tables<"skus">[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    normalized_name: "",
    sku_id: "",
    is_personal: false,
    qty: 1,
    pack_size: "",
    line_total: "",
  });
  const [skuSearch, setSkuSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCreateSku, setShowCreateSku] = useState(false);
  const [newSkuForm, setNewSkuForm] = useState<NewSkuForm>({ sku_name: "", sell_price: "", category: "" });
  const [creatingSku, setCreatingSku] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from("receipt_items")
        .select("*")
        .eq("needs_review", true)
        .order("created_at", { ascending: false }),
      supabase.from("skus").select("*").order("sku_name"),
    ]).then(([itemsRes, skusRes]) => {
      setItems(itemsRes.data || []);
      setSkus(skusRes.data || []);
      setLoading(false);
    });
  }, [user]);

  const autoFillPackSize = async (skuId: string) => {
    const { data } = await supabase
      .from("receipt_items")
      .select("pack_size")
      .eq("sku_id", skuId)
      .not("pack_size", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0 && data[0].pack_size) {
      setForm((prev) => ({ ...prev, pack_size: data[0].pack_size!.toString() }));
    }
  };

  const selectSku = (sku: Tables<"skus">) => {
    setForm((prev) => ({ ...prev, sku_id: sku.id }));
    setSkuSearch(sku.sku_name);
    autoFillPackSize(sku.id);
  };

  const openItem = (item: Tables<"receipt_items">) => {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    setForm({
      normalized_name: item.normalized_name || item.raw_name,
      sku_id: item.sku_id || "",
      is_personal: item.is_personal,
      qty: item.qty,
      pack_size: item.pack_size?.toString() || "",
      line_total: Number(item.line_total).toFixed(2),
    });
    setSkuSearch(item.normalized_name || item.raw_name);
    setShowCreateSku(false);
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
    setSkus((prev) => [...prev, data].sort((a, b) => a.sku_name.localeCompare(b.sku_name)));
    selectSku(data);
    setShowCreateSku(false);
    toast({ title: "SKU created" });
  };

  const handleApprove = async (id: string) => {
    setSaving(true);
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
    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    setExpandedId(null);
    toast({ title: "Item approved" });
  };

  const filteredSkus = skuSearch
    ? skus.filter((s) => s.sku_name.toLowerCase().includes(skuSearch.toLowerCase()))
    : skus;

  const exactMatch = skuSearch
    ? skus.some((s) => s.sku_name.toLowerCase() === skuSearch.toLowerCase())
    : true;

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Needs Review</h1>
        {items.length > 0 && (
          <Badge variant="destructive" className="text-xs">{items.length}</Badge>
        )}
      </div>
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
            <Card
              key={item.id}
              className="border-0 shadow-sm cursor-pointer"
              onClick={() => openItem(item)}
            >
              <CardContent className="p-4">
                <p className="font-medium text-sm">{item.raw_name}</p>
                <p className="text-xs text-muted-foreground">
                  Qty: {item.qty} · ${Number(item.line_total).toFixed(2)}
                </p>

                {expandedId === item.id && (
                  <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                    <div>
                      <Label className="text-xs">Normalized Name</Label>
                      <Input
                        value={form.normalized_name}
                        onChange={(e) => setForm({ ...form, normalized_name: e.target.value })}
                        className="mt-1 h-9 text-sm"
                      />
                    </div>

                    <div>
                      <Label className="text-xs">SKU Mapping</Label>
                      <Input
                        placeholder="Search SKUs..."
                        value={skuSearch}
                        onChange={(e) => {
                          setSkuSearch(e.target.value);
                          setShowCreateSku(false);
                        }}
                        className="mt-1 h-9 text-sm"
                      />
                      {(skuSearch || !form.sku_id) && (
                        <div className="mt-1 max-h-40 overflow-y-auto rounded border bg-popover">
                          {filteredSkus.slice(0, 20).map((sku) => (
                            <button
                              key={sku.id}
                              className={`w-full px-3 py-1.5 text-left text-sm hover:bg-accent ${
                                form.sku_id === sku.id ? "bg-accent font-medium" : ""
                              }`}
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
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Create "{skuSearch.trim()}"
                            </button>
                          )}
                        </div>
                      )}
                      {form.sku_id && !skuSearch && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Mapped: {skus.find((s) => s.id === form.sku_id)?.sku_name}
                        </p>
                      )}
                    </div>

                    {showCreateSku && (
                      <Card className="border shadow-sm">
                        <CardContent className="p-3 space-y-2">
                          <p className="text-xs font-medium">New SKU</p>
                          <div>
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={newSkuForm.sku_name}
                              onChange={(e) => setNewSkuForm({ ...newSkuForm, sku_name: e.target.value })}
                              className="mt-1 h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Sell Price</Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              value={newSkuForm.sell_price}
                              onChange={(e) => setNewSkuForm({ ...newSkuForm, sell_price: e.target.value })}
                              className="mt-1 h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Category</Label>
                            <Input
                              placeholder="Optional"
                              value={newSkuForm.category}
                              onChange={(e) => setNewSkuForm({ ...newSkuForm, category: e.target.value })}
                              className="mt-1 h-8 text-sm"
                            />
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" onClick={handleCreateSku} disabled={creatingSku || !newSkuForm.sku_name.trim()} className="flex-1">
                              {creatingSku ? "Creating..." : "Create & Select"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setShowCreateSku(false)}>
                              Cancel
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          value={form.qty}
                          onChange={(e) => setForm({ ...form, qty: parseInt(e.target.value) || 1 })}
                          className="mt-1 h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Pack Size</Label>
                        <Input
                          type="number"
                          value={form.pack_size}
                          onChange={(e) => setForm({ ...form, pack_size: e.target.value })}
                          className="mt-1 h-9 text-sm"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Total</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={form.line_total}
                          onChange={(e) => setForm({ ...form, line_total: e.target.value })}
                          className="mt-1 h-9 text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={form.is_personal}
                        onCheckedChange={(v) => setForm({ ...form, is_personal: v })}
                      />
                      <Label className="text-xs">Personal item</Label>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(item.id)}
                        disabled={saving}
                        className="flex-1"
                      >
                        <Check className="mr-1 h-4 w-4" />
                        {saving ? "Saving..." : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(null)}
                        className="flex-1"
                      >
                        <X className="mr-1 h-4 w-4" />
                        Skip
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
