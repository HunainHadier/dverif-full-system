import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type Status = "pending" | "verified" | "unverified" | "under_review" | "rejected" | string;

const styles: Record<string, string> = {
  verified: "bg-success/12 text-success border-success/25 dark:bg-success/15",
  // Green, like `verified` — it IS a success, and the document is just as
  // authentic. Distinguished by the primary ring so it reads as "the system did
  // this" rather than "a person approved this", which is the entire point of
  // giving auto-approval its own status.
  auto_verified:
    "bg-success/12 text-success border-success/50 ring-1 ring-success/30 dark:bg-success/15",
  unverified: "bg-destructive/12 text-destructive border-destructive/25 dark:bg-destructive/15",
  rejected: "bg-destructive/12 text-destructive border-destructive/25 dark:bg-destructive/15",
  approved: "bg-success/12 text-success border-success/25 dark:bg-success/15",
  checked_out: "bg-success/12 text-success border-success/25 dark:bg-success/15",
  checked_in:
    "bg-warning/15 text-warning-foreground border-warning/30 dark:bg-warning/20 dark:text-warning",
  pending: "bg-muted text-muted-foreground border-border",
  under_review:
    "bg-warning/15 text-warning-foreground border-warning/30 dark:bg-warning/20 dark:text-warning",
  open: "bg-warning/15 text-warning-foreground border-warning/30 dark:bg-warning/20 dark:text-warning",
  in_progress: "bg-primary/15 text-primary border-primary/30 dark:bg-primary/20",
  resolved: "bg-success/12 text-success border-success/25 dark:bg-success/15",
  closed: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status: Status }) {
  const { t } = useTranslation();
  const label = t(`status.${status}`, { defaultValue: status });
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        styles[status] ?? styles.pending,
      )}
    >
      {label}
    </Badge>
  );
}
