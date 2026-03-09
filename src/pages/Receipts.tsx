import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, Plus, Upload as UploadIcon, FileText, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { getReceiptStatus } from "@/lib/receipt-status";

type UploadState = "idle" | "uploading" | "parsing" | "done" | "error";

export default function Receipts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [receipts, setReceipts] = useState<Tables<"receipts">[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Upload state
  const [uploadExpanded, setUploadExpanded] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadReceipt, setUploadReceipt] = useState<Tables<"receipts"> | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("receipts")
      .select("*")
      .order("receipt_date", { ascending: false })
      .then(({ data }) => {
        setReceipts(data || []);
        setLoading(false);
      });
  }, [user]);

  return (
    <div className="px-4 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Receipts</h1>
        <Button size="sm" onClick={() => navigate("/upload")} className="gap-1">
          <Plus className="h-4 w-4" /> Upload
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : receipts.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No receipts yet. Upload your first PDF!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {receipts.map((r) => {
            const status = getReceiptStatus(r.parse_status);
            const StatusIcon = status.icon;
            return (
              <Card key={r.id} className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/receipts/${r.id}`)}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex-1">
                    <p className="font-medium capitalize">{r.vendor === "sams" ? "Sam's Club" : "Walmart"}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(r.receipt_date), "MMM d, yyyy")}
                      {r.item_count ? ` · ${r.item_count} items` : ""}
                    </p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="font-bold">${Number(r.total || 0).toFixed(2)}</p>
                    <Badge variant="secondary" className={`text-xs gap-1 ${status.badgeClass}`}>
                      <StatusIcon className={`h-3 w-3 ${status.animate ? "animate-spin" : ""}`} />
                      {status.label}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
