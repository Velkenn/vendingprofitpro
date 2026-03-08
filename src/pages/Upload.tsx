import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload as UploadIcon, FileText, Loader2, CheckCircle, XCircle } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type UploadState = "idle" | "uploading" | "parsing" | "done" | "error";

export default function UploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [receipt, setReceipt] = useState<Tables<"receipts"> | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const pollReceipt = useCallback((receiptId: string) => {
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("receipts")
        .select("*")
        .eq("id", receiptId)
        .single();
      if (data && data.parse_status !== "PENDING") {
        stopPolling();
        setReceipt(data);
        if (data.parse_status === "FAILED") {
          setState("error");
          setErrorMsg("Could not read this receipt. Try a clearer scan.");
        } else {
          setState("done");
        }
      }
    }, 2000);
  }, [stopPolling]);

  const handleUpload = async () => {
    if (!file || !user) return;
    setState("uploading");
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

      setReceipt(newReceipt);
      setState("parsing");

      // Fire and forget — we poll for completion
      supabase.functions.invoke("parse-receipt", {
        body: { receipt_id: newReceipt.id, file_path: filePath },
      });

      pollReceipt(newReceipt.id);
    } catch (err: any) {
      setState("error");
      setErrorMsg(err.message);
    }
  };

  const handleReset = () => {
    stopPolling();
    setFile(null);
    setReceipt(null);
    setState("idle");
    setErrorMsg("");
  };

  // Parsing / progress state
  if (state === "parsing") {
    return (
      <div className="px-4 pt-6">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Upload Receipt</h1>
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
            <div>
              <p className="font-medium">Analyzing your receipt…</p>
              <p className="text-sm text-muted-foreground mt-1">This usually takes 10–20 seconds</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Done state — success summary
  if (state === "done" && receipt) {
    return (
      <div className="px-4 pt-6">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Upload Receipt</h1>
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <CheckCircle className="h-10 w-10 text-primary" />
            <div>
              <p className="font-medium">Receipt processed!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {receipt.item_count ? `Found ${receipt.item_count} items` : "Items extracted"}
                {receipt.total ? ` · $${Number(receipt.total).toFixed(2)} total` : ""}
              </p>
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Upload Another
              </Button>
              <Button className="flex-1" onClick={() => navigate(`/receipts/${receipt.id}`)}>
                View Receipt
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className="px-4 pt-6">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Upload Receipt</h1>
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <XCircle className="h-10 w-10 text-destructive" />
            <div>
              <p className="font-medium">Something went wrong</p>
              <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Try Again
              </Button>
              {receipt && (
                <Button className="flex-1" onClick={() => navigate(`/receipts/${receipt.id}`)}>
                  View Anyway
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Idle / file selection
  return (
    <div className="px-4 pt-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Upload Receipt</h1>

      <Card
        className="border-2 border-dashed border-primary/30 shadow-none cursor-pointer hover:border-primary/60 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          {file ? (
            <>
              <FileText className="h-10 w-10 text-primary" />
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
            </>
          ) : (
            <>
              <UploadIcon className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Tap to select a PDF receipt</p>
              <p className="text-xs text-muted-foreground">Sam's Club or Walmart</p>
            </>
          )}
        </CardContent>
      </Card>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      {file && (
        <Button className="mt-4 w-full gap-2" onClick={handleUpload} disabled={state === "uploading"}>
          {state === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadIcon className="h-4 w-4" />}
          {state === "uploading" ? "Uploading…" : "Upload & Parse"}
        </Button>
      )}
    </div>
  );
}
