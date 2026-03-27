import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, Plus, Upload as UploadIcon, FileText, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  const [parseProgress, setParseProgress] = useState(0);
  const [parseLabel, setParseLabel] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (progressRef.current) {
      clearInterval(progressRef.current);
      progressRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const loadReceipts = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("receipts")
      .select("*")
      .order("receipt_date", { ascending: false });
    setReceipts(data || []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadReceipts().then(() => setLoading(false));
  }, [user, loadReceipts]);

  const pollReceipt = useCallback((receiptId: string) => {
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("receipts")
        .select("*")
        .eq("id", receiptId)
        .single();
      if (data && data.parse_status !== "PENDING") {
        stopPolling();
        setUploadReceipt(data);
        if (data.parse_status === "FAILED") {
          setUploadState("error");
          setErrorMsg("Could not read this receipt. Try a clearer scan.");
        } else {
          setUploadState("done");
          loadReceipts(); // Refresh the receipts list
        }
      }
    }, 2000);
  }, [stopPolling, loadReceipts]);

  const handleUploadClick = () => {
    if (!uploadExpanded) {
      setUploadExpanded(true);
    } else {
      fileRef.current?.click();
    }
  };

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploadState("uploading");
    setErrorMsg("");

    try {
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: newReceipt, error: dbError } = await supabase
        .from("receipts")
        .insert({
          user_id: user.id,
          vendor: "sams" as const,
          receipt_date: new Date().toISOString().split("T")[0],
          parse_status: "PENDING" as const,
          pdf_url: filePath,
        })
        .select()
        .single();
      if (dbError) throw dbError;

      setUploadReceipt(newReceipt);
      startProgressAnimation();
      setUploadState("parsing");

      // Fire and forget — we poll for completion
      supabase.functions.invoke("parse-receipt", {
        body: { receipt_id: newReceipt.id, file_path: filePath },
      });

      pollReceipt(newReceipt.id);
    } catch (err: any) {
      setUploadState("error");
      setErrorMsg(err.message);
    }
  };

  const startProgressAnimation = useCallback(() => {
    setParseProgress(0);
    setParseLabel("Uploading complete");
    const startTime = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      let progress: number;
      let label: string;
      if (elapsed < 3) {
        progress = (elapsed / 3) * 30;
        label = "Uploading complete";
      } else if (elapsed < 8) {
        progress = 30 + ((elapsed - 3) / 5) * 30;
        label = "Extracting text...";
      } else if (elapsed < 18) {
        progress = 60 + ((elapsed - 8) / 10) * 25;
        label = "Analyzing items...";
      } else if (elapsed < 33) {
        progress = 85 + ((elapsed - 18) / 15) * 10;
        label = "Almost done...";
      } else {
        progress = 95;
        label = "Almost done...";
      }
      setParseProgress(Math.min(progress, 95));
      setParseLabel(label);
    }, 200);
  }, []);

  const handleUploadReset = () => {
    stopPolling();
    setFile(null);
    setUploadReceipt(null);
    setUploadState("idle");
    setErrorMsg("");
    setParseProgress(0);
    setParseLabel("");
    setUploadExpanded(false);
  };

  return (
    <div className="px-4 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Receipts</h1>
        <Button size="sm" onClick={handleUploadClick} className="gap-1">
          <Plus className="h-4 w-4" /> Upload
        </Button>
      </div>

      {/* Inline Upload Flow */}
      {uploadExpanded && (
        <Card className={`mb-4 ${uploadState === "idle" ? "border-2 border-dashed border-primary/30" : "border-0 shadow-sm"}`}>
          <CardContent className={`${uploadState === "idle" ? "p-10" : "p-6"}`}>
            {uploadState === "idle" && (
              <div 
                className="flex flex-col items-center gap-3 text-center cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <>
                    <FileText className="h-10 w-10 text-primary" />
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                    <div className="flex gap-2 w-full mt-2">
                      <Button variant="outline" className="flex-1" onClick={(e) => { e.stopPropagation(); handleUploadReset(); }}>
                        Cancel
                      </Button>
                      <Button className="flex-1 gap-2" onClick={(e) => { e.stopPropagation(); handleUpload(); }}>
                        <UploadIcon className="h-4 w-4" />
                        Upload & Parse
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <UploadIcon className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Tap to select a PDF receipt</p>
                    <p className="text-xs text-muted-foreground">Sam's Club or Walmart</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={(e) => { e.stopPropagation(); handleUploadReset(); }}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            )}

            {uploadState === "uploading" && (
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <p className="font-medium text-sm">Uploading...</p>
                  <p className="text-xs text-muted-foreground">Please wait</p>
                </div>
              </div>
            )}

            {uploadState === "parsing" && (
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <p className="font-medium text-sm">Analyzing your receipt...</p>
                  <p className="text-xs text-muted-foreground">This usually takes 10–20 seconds</p>
                </div>
              </div>
            )}

            {uploadState === "done" && uploadReceipt && (
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Receipt processed!</p>
                  <p className="text-xs text-muted-foreground">
                    {uploadReceipt.item_count ? `Found ${uploadReceipt.item_count} items` : "Items extracted"}
                    {uploadReceipt.total ? ` · $${Number(uploadReceipt.total).toFixed(2)} total` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleUploadReset}>
                    Upload Another
                  </Button>
                  <Button size="sm" onClick={() => navigate(`/receipts/${uploadReceipt.id}`)}>
                    View Receipt
                  </Button>
                </div>
              </div>
            )}

            {uploadState === "error" && (
              <div className="flex items-center gap-3">
                <XCircle className="h-5 w-5 text-destructive" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Something went wrong</p>
                  <p className="text-xs text-muted-foreground">{errorMsg}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleUploadReset}>
                    Try Again
                  </Button>
                  {uploadReceipt && (
                    <Button size="sm" onClick={() => navigate(`/receipts/${uploadReceipt.id}`)}>
                      View Anyway
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

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
