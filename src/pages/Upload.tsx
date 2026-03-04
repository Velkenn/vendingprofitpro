import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload as UploadIcon, FileText, Loader2 } from "lucide-react";

export default function UploadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file || !user) return;
    setUploading(true);

    try {
      const filePath = `${user.id}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("receipts").getPublicUrl(filePath);

      // Create receipt record with PENDING status
      const { data: receipt, error: dbError } = await supabase
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

      // Trigger parsing edge function
      const { error: parseError } = await supabase.functions.invoke("parse-receipt", {
        body: { receipt_id: receipt.id, file_path: filePath },
      });

      if (parseError) {
        console.error("Parse error:", parseError);
        toast({ title: "Uploaded", description: "Receipt uploaded but parsing failed. You can retry later." });
      } else {
        toast({ title: "Success", description: "Receipt uploaded and parsing started!" });
      }

      navigate(`/receipts/${receipt.id}`);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

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
        <Button className="mt-4 w-full gap-2" onClick={handleUpload} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadIcon className="h-4 w-4" />}
          {uploading ? "Processing..." : "Upload & Parse"}
        </Button>
      )}
    </div>
  );
}
