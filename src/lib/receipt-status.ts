import { CheckCircle, AlertTriangle, XCircle, Loader2, type LucideIcon } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type ParseStatus = Database["public"]["Enums"]["parse_status_type"];

interface StatusConfig {
  label: string;
  icon: LucideIcon;
  colorClass: string;
  badgeClass: string;
  animate?: boolean;
}

const statusMap: Record<ParseStatus, StatusConfig> = {
  PENDING: {
    label: "Processing…",
    icon: Loader2,
    colorClass: "text-muted-foreground",
    badgeClass: "bg-muted text-muted-foreground",
    animate: true,
  },
  PARSED: {
    label: "Complete",
    icon: CheckCircle,
    colorClass: "text-primary",
    badgeClass: "bg-primary/10 text-primary",
  },
  PARTIAL_PARSE: {
    label: "Needs attention",
    icon: AlertTriangle,
    colorClass: "text-accent",
    badgeClass: "bg-accent/10 text-accent",
  },
  FAILED: {
    label: "Failed",
    icon: XCircle,
    colorClass: "text-destructive",
    badgeClass: "bg-destructive/10 text-destructive",
  },
};

export function getReceiptStatus(status: ParseStatus): StatusConfig {
  return statusMap[status] ?? statusMap.PENDING;
}
