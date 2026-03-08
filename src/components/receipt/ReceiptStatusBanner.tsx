import { useNavigate } from "react-router-dom";
import { CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Database } from "@/integrations/supabase/types";

type ParseStatus = Database["public"]["Enums"]["parse_status_type"];

interface Props {
  status: ParseStatus;
}

export default function ReceiptStatusBanner({ status }: Props) {
  const navigate = useNavigate();

  if (status === "PENDING") {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted p-3">
        <Loader2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5 animate-spin" />
        <p className="text-sm text-muted-foreground">Still processing — check back shortly.</p>
      </div>
    );
  }

  if (status === "PARSED") {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <CheckCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-primary font-medium">All items extracted successfully.</p>
      </div>
    );
  }

  if (status === "PARTIAL_PARSE") {
    return (
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/10 p-3">
        <AlertTriangle className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-accent">Some items may need corrections.</p>
          <p className="text-muted-foreground mt-0.5">
            Review flagged items or add missing ones below.{" "}
            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate("/needs-review")}>
              Go to review queue →
            </Button>
          </p>
        </div>
      </div>
    );
  }

  // FAILED
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
      <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
      <p className="text-sm text-destructive font-medium">Parsing failed. You can add items manually below.</p>
    </div>
  );
}
