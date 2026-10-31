import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, LogOut, ShieldAlert, Users, Plus, Trash2, Pencil, X } from "lucide-react";

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
  type ClearanceTemplateTask,
  type ClearanceDepartment,
  type ExitRequestDetail,
  type ExitRequestListRow,
  type ExitStatus,
  type UUID,
} from "@/services";
import { canAccessRoute } from "@/lib/routeAccess";
import { authStore } from "@/lib/auth";
import { apiErrorMessage, formatCurrency, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/offboarding")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!canAccessRoute(authStore.get().user, "/org/offboarding")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "Offboarding — Dverif" }] }),
  component: OrgOffboardingPage,
});

const PAGE_SIZE = 10;

function calendarDaysUntil(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return 0;
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUtc = Date.UTC(year, month - 1, day);
  return Math.max(0, Math.round((targetUtc - todayUtc) / 86_400_000));
}

function localTodayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

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
  const [confirmComplete, setConfirmComplete] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const isOrgAdmin = authStore.get().user?.org_role === "org_admin";

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
          {r.designation ? <p className="truncate text-xs text-muted-foreground">{r.designation}</p> : null}
        </div>
      ),
    },
    {
      key: "request_type",
      header: t("offboarding.type"),
      render: (r) => <span className="text-sm text-muted-foreground">{t(`offboarding.requestType.${r.request_type}`)}</span>,
    },
    {
      key: "last_working_day",
      header: t("offboarding.lastWorkingDay"),
      render: (r) => <span className="text-sm">{formatDate(r.last_working_day)}</span>,
    },
    {
      key: "days_until_last_working_day",
      header: t("offboarding.daysUntilLastWorkingDay"),
      render: (r) => <span className="text-sm">{t("offboarding.days", { count: r.days_until_last_working_day })}</span>,
    },
    {
      key: "clearance",
      header: t("offboarding.clearance"),
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
      render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{t(`offboarding.status.${r.status}`)}</Badge>,
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
              {queue.length > 0 ? <Badge variant="outline" className="ml-2">{queue.length}</Badge> : null}
            </TabsTrigger>
            {isOrgAdmin ? <TabsTrigger value="templates">Clearance Settings</TabsTrigger> : null}
          </TabsList>

          <TabsContent value="requests">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder={t("offboarding.searchEmployees")} />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ExitStatus | "")}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">{t("offboarding.allStatuses")}</option>
                {(["pending", "approved", "rejected", "completed"] as ExitStatus[]).map((s) => (
                  <option key={s} value={s}>{t(`offboarding.status.${s}`)}</option>
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
                  emptyClassName="py-8"
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
                  emptyClassName="py-8"
                />
              </CardContent>
            </Card>
          </TabsContent>

          {isOrgAdmin ? (
            <TabsContent value="templates">
              <ClearanceTemplatePanel />
            </TabsContent>
          ) : null}
        </Tabs>

        <ExitDetailSheet
          uuid={detailUuid}
          onClose={() => setDetailUuid(null)}
          onChanged={invalidate}
          onRequestComplete={setConfirmComplete}
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


function ClearanceTemplatePanel() {
  const qc = useQueryClient();
  const [taskName, setTaskName] = useState("");
  const [department, setDepartment] = useState<ClearanceDepartment>("HR");
  const [editing, setEditing] = useState<ClearanceTemplateTask | null>(null);
  const query = useQuery({
    queryKey: ["offboarding-clearance-templates"],
    queryFn: offboardingService.listClearanceTemplates,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["offboarding-clearance-templates"] });
  const save = useMutation({
    mutationFn: () => editing
      ? offboardingService.updateClearanceTemplate(editing.uuid, {
          department, task_name: taskName.trim(), is_active: Boolean(editing.is_active),
        })
      : offboardingService.createClearanceTemplate({ department, task_name: taskName.trim() }),
    onSuccess: () => {
      toast.success(editing ? "Clearance task updated" : "Clearance task added");
      setTaskName("");
      setDepartment("HR");
      setEditing(null);
      refresh();
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Could not save clearance task")),
  });
  const remove = useMutation({
    mutationFn: (uuid: string) => offboardingService.deleteClearanceTemplate(uuid as UUID),
    onSuccess: () => { toast.success("Clearance task removed"); refresh(); },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Could not remove clearance task")),
  });
  const toggle = useMutation({
    mutationFn: (item: ClearanceTemplateTask) => offboardingService.updateClearanceTemplate(item.uuid, {
      department: item.department, task_name: item.task_name, is_active: !Boolean(item.is_active),
    }),
    onSuccess: refresh,
    onError: (e: unknown) => toast.error(apiErrorMessage(e, "Could not update clearance task")),
  });
  const startEdit = (item: ClearanceTemplateTask) => {
    setEditing(item);
    setTaskName(item.task_name);
    setDepartment(item.department);
  };
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="font-semibold">Organization clearance checklist</h3>
          <p className="text-sm text-muted-foreground">
            Active tasks are copied into each new exit request. Changes here do not alter existing exits. No tasks are added automatically.
          </p>
        </div>
        <form className="grid gap-2 sm:grid-cols-[1fr_150px_auto_auto]" onSubmit={(e) => { e.preventDefault(); if (taskName.trim()) save.mutate(); }}>
          <input value={taskName} onChange={(e) => setTaskName(e.target.value)} maxLength={200} required placeholder="Enter clearance task" className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
          <select value={department} onChange={(e) => setDepartment(e.target.value as ClearanceDepartment)} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {(["IT", "Finance", "Assets", "HR"] as ClearanceDepartment[]).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <Button type="submit" disabled={!taskName.trim() || save.isPending} loading={save.isPending}>
            {editing ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {editing ? "Save changes" : "Add task"}
          </Button>
          {editing ? <Button type="button" variant="outline" onClick={() => { setEditing(null); setTaskName(""); setDepartment("HR"); }}><X className="h-4 w-4" /></Button> : null}
        </form>
        {query.isLoading ? <p className="text-sm text-muted-foreground">Loading tasks…</p> : null}
        {query.data?.length ? (
          <div className="divide-y rounded-lg border">
            {query.data.map((item) => (
              <div key={item.uuid} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><Badge variant="secondary">{item.department}</Badge><Badge variant={Boolean(item.is_active) ? "default" : "outline"}>{Boolean(item.is_active) ? "Active" : "Inactive"}</Badge></div>
                  <p className="mt-1 text-sm font-medium">{item.task_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEdit(item)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
                  <Button size="sm" variant="outline" onClick={() => toggle.mutate(item)} disabled={toggle.isPending}>{Boolean(item.is_active) ? "Deactivate" : "Activate"}</Button>
                  <Button size="sm" variant="destructive" onClick={() => remove.mutate(item.uuid)} disabled={remove.isPending}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No clearance tasks configured. New exit requests will start with an empty checklist and can still be completed once assets are returned.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
      key: "pending_departments",
      header: t("offboarding.department"),
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.pending_departments.map((department) => <Badge key={department} variant="secondary">{department}</Badge>)}
        </div>
      ),
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
          {t("offboarding.clearedOf", { cleared: r.total_count - r.pending_count, total: r.total_count })}
        </span>
      ),
    },
    {
      key: "assets_outstanding",
      header: t("offboarding.assets"),
      render: (r) => r.assets_outstanding > 0 ? (
        <Badge variant="destructive">{t("offboarding.assetsHeld", { count: r.assets_outstanding })}</Badge>
      ) : <span className="text-muted-foreground">—</span>,
    },
  ];
}

function ExitDetailSheet({
  uuid,
  onClose,
  onChanged,
  onRequestComplete,
}: {
  uuid: string | null;
  onClose: () => void;
  onChanged: () => void;
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
    mutationFn: (vars: { decision: "approved" | "rejected"; notes?: string; lastWorkingDay: string }) =>
      offboardingService.review(uuid as UUID, {
        decision: vars.decision,
        last_working_day: vars.decision === "approved" ? vars.lastWorkingDay : undefined,
        decision_notes: vars.notes,
      }),
    onSuccess: (result) => {
      if (result._email_warning) toast.warning(result._email_warning);
      else toast.success(t("offboarding.reviewSaved"));
      setReviewOpen(false);
      onChanged();
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, t("offboarding.reviewFailed"))),
  });

  const clearTask = useMutation({
    mutationFn: (vars: { checklistUuid: string }) => offboardingService.clearTask(uuid as UUID, vars.checklistUuid),
    onSuccess: () => {
      onChanged();
      void qc.invalidateQueries({ queryKey: ["exit-request", uuid] });
    },
    onError: (e: unknown) => toast.error(apiErrorMessage(e, t("offboarding.clearFailed"))),
  });

  const d = detail.data;

  return (
    <Sheet open={Boolean(uuid)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full max-w-2xl gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="border-b bg-card/40 px-6 py-5 text-left">
          <SheetTitle className="text-xl font-semibold">{d ? d.employee_name : t("loading")}</SheetTitle>
          <SheetDescription className="mt-1 text-xs text-muted-foreground">
            {d ? t("offboarding.detailDescription", {
              type: t(`offboarding.requestType.${d.request_type}`),
              lastDay: formatDate(d.last_working_day),
            }) : ""}
          </SheetDescription>
        </SheetHeader>

        {detail.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">{t("loading")}</p>
        ) : !d ? (
          <p className="p-6 text-sm text-destructive">{t("offboarding.notFound")}</p>
        ) : (
          <div className="space-y-6 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">{t("common.status")}:</span>
                <Badge variant={STATUS_VARIANT[d.status]} className="px-2.5 py-0.5 text-xs font-medium capitalize">
                  {t(`offboarding.status.${d.status}`)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {d.status === "pending" ? (
                  <Button size="sm" onClick={() => setReviewOpen(true)} className="shadow-sm">{t("offboarding.review")}</Button>
                ) : null}
                {d.status === "approved" ? (
                  <Button size="sm" variant="secondary" onClick={() => onRequestComplete(d.uuid)}>
                    <LogOut className="mr-1.5 h-4 w-4" />
                    {t("offboarding.completeExit")}
                  </Button>
                ) : null}
              </div>
            </div>

            {assets.data && assets.data.count > 0 ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-400">
                <div className="flex items-center gap-2 font-medium">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>{t("offboarding.assetsBlocking", { count: assets.data.count })}</span>
                </div>
              </div>
            ) : null}

            <div className="space-y-3 rounded-xl border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Request Details</h3>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Field label={t("offboarding.type")}><span className="font-medium text-foreground">{t(`offboarding.requestType.${d.request_type}`)}</span></Field>
                <Field label={t("offboarding.lastWorkingDay")}><span className="font-medium text-foreground">{formatDate(d.last_working_day)}</span></Field>
                <Field label={t("offboarding.daysUntilLastWorkingDay")}><span className="font-medium text-foreground">{t("offboarding.days", { count: d.days_until_last_working_day })}</span></Field>
                <Field label={t("offboarding.submitted")}><span className="font-medium text-foreground">{formatDate(d.created_at)}</span></Field>
                {d.reason ? <div className="col-span-2 border-t border-border/50 pt-2"><Field label={t("offboarding.reason")}><p className="mt-1 text-sm text-foreground">{d.reason}</p></Field></div> : null}
                {d.decision_notes ? <div className="col-span-2 border-t border-border/50 pt-2"><Field label={t("offboarding.decisionNotes")}><p className="mt-1 text-sm text-foreground">{d.decision_notes}</p></Field></div> : null}
              </dl>
            </div>

            {assets.data && assets.data.count > 0 ? (
              <section className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("offboarding.assetsHeldTitle")}</h3>
                  <Badge variant="destructive" className="text-xs">{assets.data.count} {assets.data.count === 1 ? "Asset" : "Assets"}</Badge>
                </div>
                <ul className="space-y-2">
                  {assets.data.items.map((a) => (
                    <li key={a.asset_uuid} className="flex items-center justify-between gap-3 rounded-lg border bg-background/80 p-2.5 text-sm">
                      <span className="font-mono text-xs font-medium">{a.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{a.purchase_cost == null ? "—" : formatCurrency(a.purchase_cost)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t("offboarding.clearance")}</h3>
                {d.checklistSummary ? <Badge variant="outline" className="text-xs">{t("offboarding.clearedOf", { cleared: d.checklistSummary.cleared, total: d.checklistSummary.total })}</Badge> : null}
              </div>
              <ul className="space-y-2">
                {d.checklist.map((item) => (
                  <li key={item.uuid} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-2.5 text-sm">
                    <span className="min-w-0 flex items-center gap-2">
                      <Badge variant="secondary" className="shrink-0 text-xs">{item.department}</Badge>
                      <span className={`truncate ${item.status === "cleared" ? "line-through text-muted-foreground opacity-60" : "font-medium text-foreground"}`}>{item.task_name}</span>
                    </span>
                    {item.status === "cleared" ? (
                      <div className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>Cleared</span>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 text-xs"
                        loading={clearTask.isPending}
                        disabled={d.status !== "approved" && d.status !== "completed"}
                        title={d.status !== "approved" && d.status !== "completed" ? t("offboarding.clearNeedsApproval") : undefined}
                        onClick={() => clearTask.mutate({ checklistUuid: item.uuid })}
                      >
                        {t("offboarding.markCleared")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {clearTask.isError ? <p className="mt-2 text-sm text-destructive">{apiErrorMessage(clearTask.error, t("offboarding.clearFailed"))}</p> : null}
            </section>

            {d.hr_notes ? (
              <section className="space-y-2 rounded-xl border bg-card p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("offboarding.hrNotes")}</h3>
                <p className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm text-foreground">{d.hr_notes}</p>
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
        onSubmit={(decision, notes, lastWorkingDay) => review.mutate({ decision, notes, lastWorkingDay })}
      />
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd>{children}</dd></div>;
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
  onSubmit: (decision: "approved" | "rejected", notes: string, lastWorkingDay: string) => void;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState("");

  useEffect(() => {
    if (open) {
      setNotes("");
      setLastWorkingDay(detail?.last_working_day ?? "");
    }
  }, [open, detail?.last_working_day]);

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("offboarding.review")}
      description={t("offboarding.reviewDescription")}
      submitLabel={t("offboarding.approve")}
      cancelLabel={t("common.cancel")}
      onSubmit={() => { if (lastWorkingDay) onSubmit("approved", notes, lastWorkingDay); }}
    >
      <div className="space-y-3">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <p className="font-medium">{detail?.employee_name}</p>
          <p className="text-xs text-muted-foreground">
            {detail ? t("offboarding.submittedLastDay", {
              lastDay: formatDate(detail.last_working_day),
              days: t("offboarding.days", { count: detail.days_until_last_working_day }),
            }) : ""}
          </p>
          {detail?.reason ? <p className="mt-1 text-xs text-muted-foreground">{detail.reason}</p> : null}
        </div>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("offboarding.lastWorkingDay")} *</span>
          <input type="date" required value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
          <span className="text-xs text-muted-foreground">{t("offboarding.confirmLastWorkingDayHint")}</span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("offboarding.decisionNotes")}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
        </label>
        <Button variant="outline" className="w-full" loading={pending} onClick={() => onSubmit("rejected", notes, lastWorkingDay)}>
          {t("offboarding.reject")}
        </Button>
      </div>
    </FormDialog>
  );
}

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
  const [lastWorkingDay, setLastWorkingDay] = useState(localTodayIso);
  const [reason, setReason] = useState("");
  const [hrNotes, setHrNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const employees = useQuery({
    queryKey: ["exit-request-employees"],
    queryFn: () => orgService.employees({ page: 1, limit: 1000 }),
    enabled: open,
  });

  const submit = useMutation({
    mutationFn: () => offboardingService.create({
      employee_uuid: employeeUuid,
      request_type: "termination",
      last_working_day: lastWorkingDay,
      reason: reason.trim(),
      hr_notes: hrNotes.trim() || undefined,
    }),
    onSuccess: (result) => {
      if (result._email_warning) toast.warning(result._email_warning);
      else toast.success(t("offboarding.exitSubmitted"));
      setEmployeeUuid("");
      setReason("");
      setHrNotes("");
      setErrors({});
      setLastWorkingDay(localTodayIso());
      onCreated();
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("offboarding.exitSubmitFailed"))),
  });

  const handleSubmit = () => {
    const next: Record<string, string> = {};
    if (!employeeUuid) next.employeeUuid = t("offboarding.employeeRequired");
    if (!lastWorkingDay) next.lastWorkingDay = t("offboarding.lastDayRequired");
    if (!reason.trim()) next.reason = t("offboarding.exitReasonRequired");
    setErrors(next);
    if (Object.keys(next).length === 0) submit.mutate();
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) setErrors({}); }}
      title={t("offboarding.newExitRequest")}
      description={t("offboarding.newExitRequestDescription")}
      submitLabel={t("offboarding.submitExit")}
      cancelLabel={t("common.cancel")}
      onSubmit={(values) => { void values; handleSubmit(); return Promise.resolve(); }}
    >
      <div className="space-y-1 text-sm">
        <span className="font-medium">{t("offboarding.employee")} *</span>
        <select value={employeeUuid} onChange={(e) => setEmployeeUuid(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm" aria-label={t("offboarding.employee")}>
          <option value="">{t("offboarding.selectEmployee")}</option>
          {(employees.data?.items ?? []).filter((e) => isCurrentEmployee(e.status)).map((e) => (
            <option key={e.uuid} value={e.uuid}>{e.full_name}{e.employee_code ? ` (${e.employee_code})` : ""}</option>
          ))}
        </select>
        {errors.employeeUuid ? <span className="block text-xs text-destructive">{errors.employeeUuid}</span> : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1 text-sm">
          <span className="font-medium">{t("offboarding.requestTypeLabel")}</span>
          <div className="flex h-9 items-center"><Badge variant="outline">{t("offboarding.requestType.termination")}</Badge></div>
        </div>
        <div className="space-y-1">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("offboarding.lastWorkingDay")} *</span>
            <input type="date" value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
            {errors.lastWorkingDay ? <span className="block text-xs text-destructive">{errors.lastWorkingDay}</span> : null}
          </label>
          {lastWorkingDay ? <p className="text-xs text-muted-foreground">{t("offboarding.daysUntilLastWorkingDay")}: {t("offboarding.days", { count: calendarDaysUntil(lastWorkingDay) })}</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("offboarding.reason")} *</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={t("offboarding.reasonPlaceholder")} className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
          {errors.reason ? <span className="block text-xs text-destructive">{errors.reason}</span> : null}
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("offboarding.hrNotes")}</span>
          <textarea value={hrNotes} onChange={(e) => setHrNotes(e.target.value)} rows={3} placeholder={t("offboarding.hrNotesPlaceholder")} className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
        </label>
      </div>
    </FormDialog>
  );
}
