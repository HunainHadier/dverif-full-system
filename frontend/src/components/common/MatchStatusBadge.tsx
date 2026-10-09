import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

type MatchStatus = "not_attempted" | "auto_matched" | "manual_review" | "no_reference_found" | string;

const styles: Record<string, string> = {
  auto_matched:
    "bg-success/12 text-success border-success/25 dark:bg-success/15",
  manual_review:
    "bg-warning/15 text-warning-foreground border-warning/30 dark:bg-warning/20 dark:text-warning",
  no_reference_found: "bg-muted text-muted-foreground border-border",
  not_attempted: "bg-muted text-muted-foreground border-border",
};

function formatConfidence(value: number | string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function MatchStatusBadge({
  status,
  confidence,
  className,
  hideNoReference,
}: {
  status?: MatchStatus | null;
  confidence?: number | string | null;
  className?: string;
  hideNoReference?: boolean;
}) {
  const { t } = useTranslation();
  if (!status || status === "not_attempted") return null;
  if (hideNoReference && status === "no_reference_found") return null;

  const showConfidence = status === "auto_matched" && confidence != null && Number(confidence) > 0;
  const label = showConfidence
    ? t("match.confidence", { confidence: formatConfidence(confidence) })
    : t(`match.status.${status}`, { defaultValue: status.replace(/_/g, " ") });

  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        styles[status] ?? styles.not_attempted,
        className,
      )}
    >
      {label}
    </Badge>
  );
}