import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, CircleAlert, LogOut } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { myResignationService, type ExitStatus } from "@/services";
import { apiErrorMessage, formatCurrency, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/my-resignation")({
  head: () => ({ meta: [{ title: "My Resignation — Dverif" }] }),
  component: MyResignationPage,
});

/**
 * Employee self-service: hand in a resignation and watch it through.
 *
 * All org roles reach this, not just employees, and that is deliberate - a
 * sub-admin who is also on the roster is an employee who can serve notice, and
 * refusing them would deny exactly the people it should serve. ROUTE_ACCESS
 * mirrors the backend's choice of authUser with no role check.
 *
 * The page is a status display first and a form second. Once a request exists,
 * the form is gone: HR reviews the submitted last working day, and letting someone
 * keep editing it only produces mismatches between what they expect and what is on
 * record.
 */

const STATUS_VARIANT: Record<ExitStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  approved: "default",
  rejected: "secondary",
  completed: "secondary",
};

/** Today, as YYYY-MM-DD, in local time rather than UTC. */
function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function calendarDaysUntil(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return 0;
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((Date.UTC(year, month - 1, day) - todayUtc) / 86_400_000));
}

/** A month out as a convenient starting date; the employee can choose another. */
function monthAheadIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function MyResignationPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [lastWorkingDay, setLastWorkingDay] = useState(monthAheadIso());
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);

  const mine = useQuery({
    queryKey: ["my-resignation"],
    queryFn: () => myResignationService.get(),
  });

  const submit = useMutation({
    mutationFn: () =>
      myResignationService.submit({
        last_working_day: lastWorkingDay,
        reason: reason.trim(),
      }),
    onSuccess: (result) => {
      if (result._email_warning) toast.warning(result._email_warning);
      else toast.success(t("myResignation.submitted"));
      setReason("");
      setReasonError(false);
      void qc.invalidateQueries({ queryKey: ["my-resignation"] });
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, t("myResignation.submitFailed"))),
  });

  const request = mine.data?.exit_request ?? null;
  const summary = mine.data?.checklistSummary ?? null;

  /**
   * Whether the resignation form should be offered at all.
   *
   * Three cases, and the first one is the bug this replaces:
   *
   *   - COMPLETED. The exit is finished, the employee has left, and offering them
   *     a resignation form is nonsense. Submitting it would be refused with "this
   *     employee has already left the organization" - a dead end with nothing on
   *     the page to explain it. Keying only on "pending or approved" treated every
   *     other status as "show the form", so a completed exit rendered one.
   *   - REJECTED. A genuine resubmission is allowed, so the form returns.
   *   - NO REQUEST AT ALL. First time.
   *
   * `on_roster` is the server's answer rather than something inferred from the
   * exit, because someone can be an ex-employee with no exit record at all - they
   * left before this module existed, or HR set the status by hand - and they must
   * not be shown a form either.
   */
  const leftOrg = mine.data?.on_roster === false;
  const canSubmit = mine.data?.on_roster !== false && (!request || request.status === "rejected");

  return (
    <ModuleGate module="separation_management">
      <div className="space-y-4">
        <PageHeader title={t("myResignation.title")} description={t("myResignation.description")} />

        {mine.isLoading ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : null}

        {request ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  {t(`myResignation.status.${request.status}`)}
                </span>
                <Badge variant={STATUS_VARIANT[request.status]}>{request.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <dl className="grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    {t("offboarding.lastWorkingDay")}
                  </dt>
                  <dd>{formatDate(request.last_working_day)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("offboarding.daysUntilLastWorkingDay")}</dt>
                  <dd>{t("offboarding.days", { count: request.days_until_last_working_day })}</dd>
                </div>
              </dl>

              {request.decision_notes ? (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
                  {request.decision_notes}
                </p>
              ) : null}

              {request.status === "rejected" ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  {t("myResignation.rejectedNote")}
                </p>
              ) : null}

              {mine.data && mine.data.outstanding_assets > 0 ? (
                // Naming the count rather than saying "there may be assets". The
                // number is the actionable part.
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  {t("myResignation.assetsWarning", { count: mine.data.outstanding_assets })}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {summary ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("myResignation.clearanceTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">
                {t("offboarding.clearedOf", { cleared: summary.cleared, total: summary.total })}
              </p>
              <ul className="space-y-1 text-sm">
                {(mine.data?.checklist ?? []).map((item) => (
                  <li key={item.uuid} className="flex items-center gap-2">
                    {item.status === "cleared" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/40" />
                    )}
                    <span className={item.status === "cleared" ? "line-through opacity-60" : ""}>
                      {item.task_name}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {mine.data?.settlement ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("myResignation.settlementTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="flex justify-between">
                <span className="text-muted-foreground">{t("offboarding.leaveEncashment")}</span>
                <span className="font-mono">
                  {formatCurrency(mine.data.settlement.leave_encashment_amount)}
                </span>
              </p>
              <p className="flex justify-between text-base font-semibold">
                <span>{t("offboarding.netFnf")}</span>
                <span className="font-mono">
                  {formatCurrency(mine.data.settlement.net_fnf_amount)}
                </span>
              </p>
            </CardContent>
          </Card>
        ) : null}

        {!canSubmit ? (
          <p className="text-sm text-muted-foreground">
            {leftOrg ? t("myResignation.alreadyLeft") : t("myResignation.alreadySubmitted")}
          </p>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4" />
                {t("myResignation.submitTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("myResignation.submitDescription")}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="lwd">{t("myResignation.lastWorkingDay")}</Label>
                <input
                  id="lwd"
                  type="date"
                  value={lastWorkingDay}
                  min={todayIso()}
                  onChange={(e) => setLastWorkingDay(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t("myResignation.daysUntil", { count: calendarDaysUntil(lastWorkingDay) })}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reason">{t("offboarding.reason")} *</Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (e.target.value.trim()) setReasonError(false);
                  }}
                  rows={3}
                  placeholder={t("myResignation.reasonPlaceholder")}
                />
                {reasonError ? (
                  <p className="text-xs text-destructive">{t("myResignation.reasonRequired")}</p>
                ) : null}
              </div>
              {submit.isError ? (
                <p className="text-sm text-destructive">
                  <CircleAlert className="mr-1.5 inline h-4 w-4" />
                  {apiErrorMessage(submit.error, t("myResignation.submitFailed"))}
                </p>
              ) : null}
              <Button
                onClick={() => {
                  if (!reason.trim()) {
                    setReasonError(true);
                    return;
                  }
                  submit.mutate();
                }}
                loading={submit.isPending}
                disabled={!lastWorkingDay || submit.isPending}
              >
                {t("myResignation.submit")}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </ModuleGate>
  );
}
