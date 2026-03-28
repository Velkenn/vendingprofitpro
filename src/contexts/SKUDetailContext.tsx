import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import SKUDetailModal from "@/components/sku/SKUDetailModal";

interface SKUDetailContextType {
  openSKUDetail: (skuId: string) => void;
}

const SKUDetailContext = createContext<SKUDetailContextType | null>(null);

export function useSKUDetail() {
  const ctx = useContext(SKUDetailContext);
  if (!ctx) throw new Error("useSKUDetail must be used within SKUDetailProvider");
  return ctx;
}

export function SKUDetailProvider({ children }: { children: ReactNode }) {
  const [skuId, setSkuId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const openSKUDetail = useCallback((id: string) => {
    setSkuId(id);
    setOpen(true);
  }, []);

  return (
    <SKUDetailContext.Provider value={{ openSKUDetail }}>
      {children}
      <SKUDetailModal skuId={skuId} open={open} onClose={() => setOpen(false)} />
    </SKUDetailContext.Provider>
  );
}
