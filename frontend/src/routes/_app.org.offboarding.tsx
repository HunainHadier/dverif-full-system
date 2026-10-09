import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, CircleDollarSign, LogOut, ShieldAlert, Users } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { FormDialog } from "@/components/hr/FormDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
  import {
    offboardingService,
    isCurrentEmployee,
    orgService,
    type ClearanceQueueRow,
    type ExitRequestDetail,
    type ExitRequestListRow,
    type ExitRequestType,
    type ExitStatus,
    type SettlementCalc,
    type UUID,
  } from "@/services";
import { canAccessRoute } from "@/lib/routeAccess";
import { authStore } from "@/lib/auth";
import { apiErrorMessage, formatCurrency, formatDate } from "@/lib/utils";
export const Route = createFileRoute("/_app/org/offboarding")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // The same call the sidebar makes before rendering the link, so a visible
    // link and a reachable page cannot disagree. See lib/routeAccess.
    if (!canAccessRoute(authStore.get().user, "/org/offboarding")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "Offboarding — Dverif" }] }),
  component: OrgOffboardingPage,
});

const PAGE_SIZE = 10;

const STATUS_VARIANT: Record<ExitStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  approved: "default",
  rejected: "secondary",
  completed: "secondary",
};

function OrgOffboardingPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState("requests");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ExitStatus | "">("");
  const [detailUuid, setDetailUuid] = useState<string | null>(null);
  const [settlementFor, setSettlementFor] = useState<string | null>(null);
    const [confirmComplete, setConfirmComplete] = useState<string | null>(null);
    const [newOpen, setNewOpen] = useState(false);

  // Reset to the first page whenever the result set narrows, or the table renders
  // an empty page that reads as "nobody is leaving" when in fact there is no
  // page 4 of this filter.
  useEffect(() => {
    setPage(1);
  }, [search, status]);

  const list = useQuery({
    queryKey: ["exit-requests", page, search, status],
    queryFn: () =>
      offboardingService.list({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
      }),
  });

  const clearances = useQuery({
    queryKey: ["offboarding-clearances"],
    queryFn: () => offboardingService.clearanceQueue(),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["exit-requests"] });
    void qc.invalidateQueries({ queryKey: ["offboarding-clearances"] });
    void qc.invalidateQueries({ queryKey: ["exit-request"] });
    void qc.invalidateQueries({ queryKey: ["exit-settlement"] });
  };

  const complete = useMutation({
    mutationFn: (uuid: string) => offboardingService.complete(uuid),
    onSuccess: () => {
      toast.success(t("offboarding.completed"));
      invalidate();
      setConfirmComplete(null);
      setDetailUuid(null);
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, t("offboarding.completeFailed"))),
  });

  const rows = list.data?.items ?? [];
  const queue = clearances.data?.items ?? [];

  const columns: DataTableColumn<ExitRequestListRow>[] = [
    {
      key: "employee_name",
      header: t("offboarding.employee"),
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.employee_name}</p>
          {r.designation ? (
            <p className="truncate text-xs text-muted-foreground">{r.designation}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "request_type",
      header: t("offboarding.type"),
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {t(`offboarding.requestType.${r.request_type}`)}
        </span>
      ),
    },
    {
      key: "last_working_day",
      header: t("offboarding.lastWorkingDay"),
      render: (r) => <span className="text-sm">{formatDate(r.last_working_day)}</span>,
    },
    {
      key: "notice_period_days",
      header: t("offboarding.notice"),
      render: (r) => (
        <span className="text-sm">{t("offboarding.days", { count: r.notice_period_days })}</span>
      ),
    },
    {
      key: "clearance",
      header: t("offboarding.clearance"),
      // A count, not a percentage, and never a bare tick: an exit with two of
      // nine tasks done is not "in progress" in any sense a person being chased
      // about it would recognise.
      render: (r) => (
        <span className="text-sm">
          {t("offboarding.clearedOf", {
            cleared: r.clearance_total - r.clearance_pending,
            total: r.clearance_total,
          })}
          {r.assets_outstanding > 0 ? (
            <Badge variant="outline" className="ml-2 text-amber-600">
              {t("offboarding.assetsHeld", { count: r.assets_outstanding })}
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: "status",
      header: t("common.status"),
      render: (r) => (
        <Badge variant={STATUS_VARIANT[r.status]}>{t(`offboarding.status.${r.status}`)}</Badge>
      ),
    },
  ];

  return (
    <ModuleGate module="separation_management">
      <div className="space-y-4">
        <PageHeader
          title={t("offboarding.title")}
          description={t("offboarding.description")}
          actions={
            <Button onClick={() => setNewOpen(true)}>
              <LogOut className="mr-2 h-4 w-4" />
              {t("offboarding.newExitRequest")}
            </Button>
          }
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="requests">{t("offboarding.exitRequests")}</TabsTrigger>
            <TabsTrigger value="clearances">
              {t("offboarding.clearances")}
              {queue.length > 0 ? (
                <Badge variant="outline" className="ml-2">
                  {queue.length}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t("offboarding.searchEmployees")}
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ExitStatus | "")}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">{t("offboarding.allStatuses")}</option>
                {(["pending", "approved", "rejected", "completed"] as ExitStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {t(`offboarding.status.${s}`)}
                  </option>
                ))}
              </select>
            </div>

            <Card>
              <CardContent className="p-0">
                <DataTable
                  columns={columns}
                  rows={rows}
                  total={list.data?.total ?? 0}
                  page={list.data?.page ?? 1}
                  totalPages={list.data?.totalPages ?? 1}
                  onPageChange={setPage}
                  loading={list.isLoading}
                  onRowClick={(r) => setDetailUuid(r.uuid)}
                  emptyIcon={Users}
                  emptyTitle={t("offboarding.noExits")}
                  emptyDescription={t("offboarding.noExitsDescription")}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="clearances">
            <Card>
              <CardContent className="p-0">
                <DataTable
                  columns={clearanceColumns(t)}
                  rows={queue}
                  total={queue.length}
                  page={1}
                  totalPages={1}
                  onRowClick={(r) => setDetailUuid(r.exit_request_uuid)}
                  emptyIcon={CheckCircle2}
                  emptyTitle={t("offboarding.noClearances")}
                  emptyDescription={t("offboarding.noClearancesDescription")}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <ExitDetailSheet
          uuid={detailUuid}
          onClose={() => setDetailUuid(null)}
          onChanged={invalidate}
          onOpenSettlement={(uuid) => setSettlementFor(uuid)}
          onRequestComplete={setConfirmComplete}
        />

        <SettlementDialog
          uuid={settlementFor}
          onClose={() => setSettlementFor(null)}
          onSaved={invalidate}
        />

        <NewExitDialog
          open={newOpen}
          onOpenChange={setNewOpen}
          onCreated={() => {
            setNewOpen(false);
            setPage(1);
            invalidate();
          }}
        />

        <ConfirmDialog
          open={Boolean(confirmComplete)}
          onOpenChange={(o) => !o && setConfirmComplete(null)}
          title={t("offboarding.completeTitle")}
          description={t("offboarding.completeConfirm")}
          confirmLabel={t("offboarding.completeExit")}
          onConfirm={() => confirmComplete && complete.mutate(confirmComplete)}
        />
      </div>
    </ModuleGate>
  );
}

/**
 * The clearance queue, grouped by department.
 *
 * One row per (exit, department) rather than per exit, because the question this
 * tab answers is "what is waiting on IT", not "who is leaving". Collapsing to one
 * row per exit hides which team is the blocker, which is the only reason to open
 * the tab.
 */
function clearanceColumns(
  t: (k: string, o?: Record<string, unknown>) => string,
): DataTableColumn<ClearanceQueueRow>[] {
  return [
    {
      key: "employee_name",
      header: t("offboarding.employee"),
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.employee_name}</p>
          <p className="truncate text-xs text-muted-foreground">{r.designation ?? ""}</p>
        </div>
      ),
    },
    {
      key: "department",
      header: t("offboarding.department"),
      render: (r) => <Badge variant="secondary">{r.department}</Badge>,
    },
    {
      key: "last_working_day",
      header: t("offboarding.lastWorkingDay"),
      render: (r) => <span className="text-sm">{formatDate(r.last_working_day)}</span>,
    },
    {
      key: "pending_count",
      header: t("offboarding.outstanding"),
      render: (r) => (
        <span className="text-sm">
          {t("offboarding.clearedOf", {
            cleared: r.total_count - r.pending_count,
            total: r.total_count,
          })}
        </span>
      ),
    },
    {
      key: "assets_outstanding",
      header: t("offboarding.assets"),
      render: (r) =>
        r.assets_outstanding > 0 ? (
          <Badge variant="destructive">
            {t("offboarding.assetsHeld", { count: r.assets_outstanding })}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];
}

// ---------------------------------------------------------------------------
// Detail sheet: review, clearance, and what is still owed
// ---------------------------------------------------------------------------

function ExitDetailSheet({
  uuid,
  onClose,
  onChanged,
  onOpenSettlement,
  onRequestComplete,
}: {
  uuid: string | null;
  onClose: () => void;
  onChanged: () => void;
  onOpenSettlement: (uuid: string) => void;
  onRequestComplete: (uuid: string) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [reviewOpen, setReviewOpen] = useState(false);

  const detail = useQuery({
    queryKey: ["exit-request", uuid],
    queryFn: () => offboardingService.detail(uuid as UUID),
    enabled: Boolean(uuid),
  });

  const assets = useQuery({
    queryKey: ["exit-assets", uuid],
    queryFn: () => offboardingService.outstandingAssets(uuid as UUID),
    enabled: Boolean(uuid),
  });

  const review = useMutation({
    mutationFn: (vars: { decision: "approved" | "rejected"; notes?: string }) =>
      offboardingService.review(uuid as UUID, {
        decision: vars.decision,
        decision_notes: vars.notes,
      }),
    onSuccess: () => {
      toast.success(t("offboarding.reviewSaved"));
      setReviewOpen(false);
      onChanged();
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, t("offboarding.reviewFailed"))),
  });

  const clearTask = useMutation({
    mutationFn: (vars: { checklistUuid: string }) =>
      offboardingService.clearTask(uuid as UUID, vars.checklistUuid),
    onSuccess: () => {
      onChanged();
      void qc.invalidateQueries({ queryKey: ["exit-request", uuid] });
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, t("offboarding.clearFailed"))),
  });

  const d = detail.data;

  return (
    <Sheet
      open={Boolean(uuid)}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full max-w-2xl gap-0 overflow-y-auto p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle>{d ? d.employee_name : t("loading")}</SheetTitle>
          <SheetDescription>
            {d
              ? t("offboarding.detailDescription", {
                  type: t(`offboarding.requestType.${d.request_type}`),
                  lastDay: formatDate(d.last_working_day),
                })
              : ""}
          </SheetDescription>
        </SheetHeader>

        {detail.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">{t("loading")}</p>
        ) : !d ? (
          <p className="p-5 text-sm text-destructive">{t("offboarding.notFound")}</p>
        ) : (
          <div className="space-y-6 px-5 pb-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[d.status]}>
                {t(`offboarding.status.${d.status}`)}
              </Badge>
              {d.status === "pending" ? (
                <Button size="sm" onClick={() => setReviewOpen(true)}>
                  {t("offboarding.review")}
                </Button>
              ) : null}
              {d.status === "approved" ? (
                <Button size="sm" variant="outline" onClick={() => onOpenSettlement(d.uuid)}>
                  <CircleDollarSign className="mr-2 h-4 w-4" />
                  {t("offboarding.fnf")}
                </Button>
              ) : null}
              {d.status === "approved" ? (
                <Button size="sm" variant="ghost" onClick={() => onRequestComplete(d.uuid)}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("offboarding.completeExit")}
                </Button>
              ) : null}
            </div>

            {/* Blocking conditions stated up front, not left for the user to
                discover by pressing a button and reading a 409. */}
            {assets.data && assets.data.count > 0 ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                <ShieldAlert className="mr-1.5 inline h-3.5 w-3.5" />
                {t("offboarding.assetsBlocking", { count: assets.data.count })}
              </p>
            ) : null}

            <dl className="grid grid-cols-2 gap-2 text-sm">
              <Field label={t("offboarding.type")}>
                {t(`offboarding.requestType.${d.request_type}`)}
              </Field>
              <Field label={t("offboarding.lastWorkingDay")}>
                {formatDate(d.last_working_day)}
              </Field>
              <Field label={t("offboarding.notice")}>
                {t("offboarding.days", { count: d.notice_period_days })}
              </Field>
              <Field label={t("offboarding.submitted")}>{formatDate(d.created_at)}</Field>
              {d.reason ? (
                <div className="col-span-2">
                  <Field label={t("offboarding.reason")}>{d.reason}</Field>
                </div>
              ) : null}
              {d.decision_notes ? (
                <div className="col-span-2">
                  <Field label={t("offboarding.decisionNotes")}>{d.decision_notes}</Field>
                </div>
              ) : null}
            </dl>

            {/* ---- assets still held ---- */}
            {assets.data && assets.data.count > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t("offboarding.assetsHeldTitle")}</h3>
                <ul className="space-y-1 text-sm">
                  {assets.data.items.map((a) => (
                    <li key={a.asset_uuid} className="flex justify-between gap-3">
                      <span className="font-mono text-xs">
                        {a.asset_tag} — {a.name}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {a.purchase_cost == null ? "—" : formatCurrency(a.purchase_cost)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* ---- clearance checklist ---- */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t("offboarding.clearance")}</h3>
              {d.checklistSummary ? (
                <p className="mb-2 text-xs text-muted-foreground">
                  {t("offboarding.clearedOf", {
                    cleared: d.checklistSummary.cleared,
                    total: d.checklistSummary.total,
                  })}
                </p>
              ) : null}
              <ul className="space-y-2">
                {d.checklist.map((item) => (
                  <li key={item.uuid} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <Badge variant="secondary" className="mr-2">
                        {item.department}
                      </Badge>
                      <span className={item.status === "cleared" ? "line-through opacity-60" : ""}>
                        {item.task_name}
                      </span>
                    </span>
                    {item.status === "cleared" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={clearTask.isPending}
                        // Disabled up front rather than letting the click fail: the
                        // server refuses clearance on an unapproved exit, and a dead
                        // button with no reason is worse than one that says so.
                        disabled={d.status !== "approved" && d.status !== "completed"}
                        title={
                          d.status !== "approved" && d.status !== "completed"
                            ? t("offboarding.clearNeedsApproval")
                            : undefined
                        }
                        onClick={() => clearTask.mutate({ checklistUuid: item.uuid })}
                      >
                        {t("offboarding.markCleared")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {clearTask.isError ? (
                <p className="mt-2 text-sm text-destructive">
                  {apiErrorMessage(clearTask.error, t("offboarding.clearFailed"))}
                </p>
              ) : null}
            </section>

            {d.hr_notes ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t("offboarding.hrNotes")}</h3>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {d.hr_notes}
                </p>
              </section>
            ) : null}
          </div>
        )}
      </SheetContent>

      <ReviewDialog
        open={reviewOpen}
        detail={d}
        pending={review.isPending}
        onClose={() => setReviewOpen(false)}
        onSubmit={(decision, notes) => review.mutate({ decision, notes })}
      />
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ReviewDialog({
  open,
  detail,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  detail: ExitRequestDetail | undefined;
  pending: boolean;
  onClose: () => void;
  onSubmit: (decision: "approved" | "rejected", notes: string) => void;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) setNotes("");
  }, [open]);

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("offboarding.review")}
      description={t("offboarding.reviewDescription")}
      submitLabel={t("offboarding.approve")}
      cancelLabel={t("common.cancel")}
      onSubmit={() => onSubmit("approved", notes)}
    >
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p className="font-medium">{detail?.employee_name}</p>
          <p className="text-xs text-muted-foreground">
            {detail
              ? t("offboarding.submittedLastDay", {
                  lastDay: formatDate(detail.last_working_day),
                  notice: t("offboarding.days", { count: detail.notice_period_days }),
                })
              : ""}
          </p>
          {detail?.reason ? (
            <p className="mt-1 text-xs text-muted-foreground">{detail.reason}</p>
          ) : null}
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("offboarding.decisionNotes")}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <Button
          variant="outline"
          className="w-full"
          loading={pending}
          onClick={() => onSubmit("rejected", notes)}
        >
          {t("offboarding.reject")}
        </Button>
      </div>
    </FormDialog>
  );
}

/**
 * Opens an exit.
 *
 * The review, clearance and settlement halves of this module all existed and all
 * worked, but nothing could start one -- the exit-requests list could only ever
 * stay empty because an employee can open their own exit from the ESS side and a
 * resignation nobody recorded was simply an employee who stopped showing up.
 * This writes through `offboardingService.create`, which already posted to the
 * server's own endpoint.
 *
 * Status is not offered: the server always opens a new request as pending, and
 * that is deliberate, so this form does not pretend otherwise.
 */
function NewExitDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const [employeeUuid, setEmployeeUuid] = useState("");
  const [requestType, setRequestType] = useState<ExitRequestType>("resignation");
  const [noticeDays, setNoticeDays] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [hrNotes, setHrNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const employees = useQuery({
    queryKey: ["exit-request-employees"],
    queryFn: () => orgService.employees({ page: 1, limit: 1000 }),
    enabled: open,
  });

  const submit = useMutation({
    mutationFn: () =>
      offboardingService.create({
        employee_uuid: employeeUuid,
        request_type: requestType,
        notice_period_days: noticeDays.trim() ? Number(noticeDays) : 0,
        last_working_day: lastWorkingDay,
        reason: reason.trim() || undefined,
        hr_notes: hrNotes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t("offboarding.exitSubmitted"));
      setEmployeeUuid("");
      setRequestType("resignation");
      setNoticeDays("");
      setReason("");
      setHrNotes("");
      setErrors({});
      setLastWorkingDay(new Date().toISOString().slice(0, 10));
      onCreated();
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("offboarding.exitSubmitFailed"))),
  });

  const handleSubmit = () => {
    const next: Record<string, string> = {};
    if (!employeeUuid) next.employeeUuid = t("offboarding.employeeRequired");
    const days = noticeDays.trim() ? Number(noticeDays) : 0;
    if (noticeDays.trim() && (!Number.isInteger(days) || days < 0))
      next.noticeDays = t("offboarding.noticeInvalid");
    if (!lastWorkingDay) next.lastWorkingDay = t("offboarding.lastDayRequired");
    setErrors(next);
    if (Object.keys(next).length === 0) submit.mutate();
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setErrors({});
      }}
      title={t("offboarding.newExitRequest")}
      description={t("offboarding.newExitRequestDescription")}
      submitLabel={t("offboarding.submitExit")}
      cancelLabel={t("common.cancel")}
      onSubmit={(values) => {
        void values;
        handleSubmit();
        return Promise.resolve();
      }}
    >
      <div className="space-y-1 text-sm">
        <span className="font-medium">{t("offboarding.employee")} *</span>
        <select
          value={employeeUuid}
          onChange={(e) => setEmployeeUuid(e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          aria-label={t("offboarding.employee")}
        >
          <option value="">{t("offboarding.selectEmployee")}</option>
          {(employees.data?.items ?? [])
            .filter((e) => isCurrentEmployee(e.status))
            .map((e) => (
              <option key={e.uuid} value={e.uuid}>
                {e.full_name}
                {e.employee_code ? ` (${e.employee_code})` : ""}
              </option>
            ))}
        </select>
        {errors.employeeUuid ? (
          <span className="block text-xs text-destructive">{errors.employeeUuid}</span>
        ) : null}
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("offboarding.requestTypeLabel")} *</span>
        <select
          value={requestType}
          onChange={(e) => setRequestType(e.target.value as ExitRequestType)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="resignation">{t("offboarding.requestType.resignation")}</option>
          <option value="termination">{t("offboarding.requestType.termination")}</option>
        </select>
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("offboarding.noticePeriod")}</span>
          <input
            type="number"
            min="0"
            step="1"
            value={noticeDays}
            onChange={(e) => setNoticeDays(e.target.value)}
            placeholder="0"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
          {errors.noticeDays ? (
            <span className="block text-xs text-destructive">{errors.noticeDays}</span>
          ) : null}
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("offboarding.lastWorkingDay")} *</span>
          <input
            type="date"
            value={lastWorkingDay}
            onChange={(e) => setLastWorkingDay(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
          {errors.lastWorkingDay ? (
            <span className="block text-xs text-destructive">{errors.lastWorkingDay}</span>
          ) : null}
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("offboarding.reason")}</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder={t("offboarding.reasonPlaceholder")}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("offboarding.hrNotes")}</span>
        <textarea
          value={hrNotes}
          onChange={(e) => setHrNotes(e.target.value)}
          rows={2}
          placeholder={t("offboarding.hrNotesPlaceholder")}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
      </label>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// FnF settlement
// ---------------------------------------------------------------------------

/**
 * The Full & Final dialog.
 *
 * Preview on open, so nothing is written until someone has read the figures. The
 * cap on an asset deduction is called out explicitly: when a laptop is worth more
 * than the settlement, the number that cannot be recovered has to be visible on
 * screen, because it is a debt somebody will collect and not an adjustment
 * somebody made.
 */
function SettlementDialog({
  uuid,
  onClose,
  onSaved,
}: {
  uuid: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [reference, setReference] = useState("");

  const preview = useQuery({
    queryKey: ["exit-settlement", uuid],
    queryFn: () => offboardingService.previewSettlement(uuid as UUID),
    enabled: Boolean(uuid),
  });

  const draft = useMutation({
    mutationFn: () => offboardingService.draftSettlement(uuid as UUID),
    onSuccess: () => {
      toast.success(t("offboarding.fnfDrafted"));
      onSaved();
      void qc.invalidateQueries({ queryKey: ["exit-settlement", uuid] });
      onClose();
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, t("offboarding.fnfFailed"))),
  });

  const advance = useMutation({
    mutationFn: (target: "processed" | "paid") =>
      offboardingService.advanceSettlement(uuid as UUID, target, reference || undefined),
    onSuccess: () => {
      toast.success(t("offboarding.fnfAdvanced"));
      onSaved();
      void qc.invalidateQueries({ queryKey: ["exit-settlement", uuid] });
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, t("offboarding.fnfFailed"))),
  });

  const s = preview.data;
  const blocked = s ? s.assets.count > 0 : false;

  return (
    <Dialog
      open={Boolean(uuid)}
      onOpenChange={(o) => {
        if (!o) {
          setReference("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("offboarding.fnf")}</DialogTitle>
          <DialogDescription>
            {t("offboarding.fnfDescription", {
              name: s?.employee_name ?? "",
              lastDay: s ? formatDate(s.last_working_day) : "",
            })}
          </DialogDescription>
        </DialogHeader>

        {preview.isError ? (
          <p className="text-sm text-destructive">
            {apiErrorMessage(preview.error, t("offboarding.fnfFailed"))}
          </p>
        ) : null}

        {s ? <SettlementBreakdown s={s} /> : null}

        {blocked && s ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            {t("offboarding.fnfBlocked", { count: s.assets.count })}
          </p>
        ) : null}

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("offboarding.paymentReference")}</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => draft.mutate()}
            loading={draft.isPending}
            disabled={preview.isLoading}
          >
            {t("offboarding.fnfSaveDraft")}
          </Button>
          <Button
            variant="secondary"
            onClick={() => advance.mutate("processed")}
            loading={advance.isPending}
            // Disabled up front rather than letting it 409: the guard refusing a
            // settlement because a laptop is still out is important, but a button
            // that fails on click teaches people the page is unreliable.
            disabled={blocked || preview.isLoading}
            title={
              blocked ? t("offboarding.fnfBlocked", { count: s?.assets.count ?? 0 }) : undefined
            }
          >
            {t("offboarding.fnfProcess")}
          </Button>
          <Button
            onClick={() => advance.mutate("paid")}
            loading={advance.isPending}
            disabled={blocked || preview.isLoading}
          >
            {t("offboarding.fnfMarkPaid")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The arithmetic, shown as arithmetic.
 *
 * Every input is on screen next to its result, because a settlement is a document
 * someone will be asked to justify to the person receiving it. A single net
 * figure with no working shown is not defensible, and the person who cannot
 * defend it is usually not the person who can query the database.
 */
function SettlementBreakdown({ s }: { s: SettlementCalc }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Field label={t("offboarding.basicSalary")}>{formatCurrency(s.basic_salary)}</Field>
        <Field label={t("offboarding.workingDays")}>{s.working_days_in_month}</Field>
        <Field label={t("offboarding.perDayRate")}>{formatCurrency(s.per_day_rate)}</Field>
        <Field label={t("offboarding.perHourRate")}>
          {formatCurrency(Number(s.per_day_rate) / 8)}
        </Field>
      </dl>

      <section className="rounded-md border p-3">
        <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          {t("offboarding.leaveEncashment")}
        </h4>
        {s.leave.rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("offboarding.noLeaveAllocated")}</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {s.leave.rows.map((r) => (
              <li key={r.leave_type} className="flex justify-between gap-3">
                <span>
                  {r.leave_type}
                  {r.is_paid === "no" ? (
                    <span className="ml-1 text-muted-foreground">({t("offboarding.unpaid")})</span>
                  ) : null}
                </span>
                <span className="font-mono">{r.encashable_days}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 flex justify-between border-t pt-2 text-xs font-medium">
          <span>
            {t("offboarding.encashableDays", { count: s.leave.encashable_days })} ×{" "}
            {formatCurrency(s.per_day_rate)}
          </span>
          <span className="font-mono">{formatCurrency(s.leave.amount)}</span>
        </p>
      </section>

      <section className="rounded-md border p-3">
        <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          {t("offboarding.notice")}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t("offboarding.noticeServed", {
            served: s.notice.notice_days_served,
            required: s.notice.notice_period_days,
          })}
        </p>
        {s.notice.shortfall_days > 0 ? (
          <p className="mt-1 flex justify-between text-xs font-medium">
            <span>{t("offboarding.noticeShortfall", { days: s.notice.shortfall_days })}</span>
            <span className="font-mono">−{formatCurrency(s.notice.recovery)}</span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{t("offboarding.noticeFullyServed")}</p>
        )}
      </section>

      <section className="rounded-md border p-3">
        <h4 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          {t("offboarding.assetDeduction")}
        </h4>
        {s.assets.count === 0 ? (
          <p className="text-xs text-muted-foreground">{t("offboarding.noAssetsHeld")}</p>
        ) : (
          <>
            <p className="flex justify-between text-xs">
              <span>{t("offboarding.assetsHeld", { count: s.assets.count })}</span>
              <span className="font-mono">{formatCurrency(s.assets.exposure)}</span>
            </p>
            <p className="mt-1 flex justify-between text-xs font-medium">
              <span>{t("offboarding.deducted")}</span>
              <span className="font-mono">−{formatCurrency(s.assets.applied)}</span>
            </p>
            {s.assets.capped ? (
              // The cap limits the deduction; it does not erase the debt. Showing
              // the shortfall is the difference between a settlement and a
              // quietly written-off asset.
              <p className="mt-1 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                {t("offboarding.assetCapNote", {
                  amount: formatCurrency(s.assets.withheld_amount),
                })}
              </p>
            ) : null}
          </>
        )}
      </section>

      <div className="flex justify-between border-t pt-2 text-base font-semibold">
        <span>{t("offboarding.netFnf")}</span>
        <span className="font-mono">{formatCurrency(s.net_fnf_amount)}</span>
      </div>
    </div>
  );
}
