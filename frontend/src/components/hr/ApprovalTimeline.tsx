import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle, Clock, MinusCircle, Ban, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Renders the audit trail of an approval workflow.
 *
 * Consumes `approval_step_history` — APPEND-ONLY on the server, so this is a
 * faithful log rather than a reconstructed guess. Each step that the chain
 * passed through appears, including ones that were skipped or cancelled, because
 * a gap in a timeline is indistinguishable from a step that never existed.
 *
 * The current step is derived from the request's `current_step_order`, so an
 * in-flight approval shows where it is stuck rather than only what already
 * happened — an approval queue where you cannot see the current position is
 * useless for the thing it exists to do.
 */

export type ApprovalStep = {
  uuid?: string;
  step_order: number;
  step_name: string;
  approver_name?: string | null;
  approver_uuid?: string | null;
  decision: "pending" | "approved" | "rejected" | "skipped" | "cancelled" | "forwarded";
  comments?: string | null;
  acted_at?: string;
};

const DECISION_STYLE: Record<
  ApprovalStep["decision"],
  { icon: typeof CheckCircle2; className: string; labelKey: string }
> = {
  approved: { icon: CheckCircle2, className: "text-emerald-600", labelKey: "hr.approval.approved" },
  rejected: { icon: XCircle, className: "text-destructive", labelKey: "hr.approval.rejected" },
  pending: { icon: Clock, className: "text-muted-foreground", labelKey: "hr.approval.pending" },
  skipped: {
    icon: MinusCircle,
    className: "text-muted-foreground",
    labelKey: "hr.approval.skipped",
  },
  cancelled: { icon: Ban, className: "text-muted-foreground", labelKey: "hr.approval.cancelled" },
  forwarded: { icon: ArrowRight, className: "text-blue-600", labelKey: "hr.approval.forwarded" },
};

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-PK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ApprovalTimeline({
  steps,
  currentStepOrder,
  className,
}: {
  steps: ApprovalStep[];
  /** step_order the request is sitting on right now; null once resolved. */
  currentStepOrder?: number | null;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!steps.length) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>{t("hr.approval.noHistory")}</p>
    );
  }

  return (
    <ol className={cn("relative space-y-4", className)}>
      {steps.map((step, index) => {
        const style = DECISION_STYLE[step.decision] ?? DECISION_STYLE.pending;
        const Icon = style.icon;
        // Only the still-open step is "current"; a resolved request has no
        // current step even though its last entry reads 'approved'.
        const isCurrent = currentStepOrder != null && step.step_order === currentStepOrder;
        const isLast = index === steps.length - 1;

        return (
          <li key={step.uuid ?? `${step.step_order}-${index}`} className="relative flex gap-3">
            {/* Connector between markers, omitted after the final entry. */}
            {!isLast ? (
              <span
                aria-hidden
                className="absolute left-[11px] top-6 h-[calc(100%-1rem)] w-px bg-border"
              />
            ) : null}

            <span
              className={cn(
                "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-card",
                isCurrent ? "border-primary" : "border-border",
              )}
            >
              <Icon className={cn("h-3.5 w-3.5", style.className)} />
            </span>

            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">{step.step_name}</span>
                <span className={cn("text-xs", style.className)}>{t(style.labelKey)}</span>
                {isCurrent ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {t("hr.approval.currentStep")}
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                {step.approver_name ?? t("hr.approval.system")}
                {step.acted_at ? ` · ${formatDate(step.acted_at)}` : ""}
              </p>

              {step.comments ? (
                <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                  {step.comments}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Compact one-line status, for list rows where a full timeline will not fit. */
export function ApprovalStatusBadge({
  status,
  currentStepName,
}: {
  status?: string | null;
  currentStepName?: string | null;
}) {
  const { t } = useTranslation();
  if (!status) return null;

  const tone =
    status === "approved"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "rejected"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : status === "cancelled"
          ? "border-border bg-muted text-muted-foreground"
          : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      {t(`hr.approval.${status}`)}
      {status === "pending" && currentStepName ? ` · ${currentStepName}` : ""}
    </span>
  );
}
