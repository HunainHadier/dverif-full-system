import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Eye,
  Lock,
  Pencil,
  Plus,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";

import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { useAuth } from "@/lib/auth";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { ModuleFeatureLockedCard } from "@/components/common/SubscriptionLocked";
import { LeaveRequestDetailsDialog } from "@/components/leaves/LeaveRequestDetailsDialog";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { TableSkeleton } from "./_app.requests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  orgLeavesService,
  orgLeaveAllocationService,
  type LeaveRequest,
  type LeaveType,
} from "@/services";
import { countDays, formatDate, formatDateTime, parseFeatureAccess } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/leaves")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Deliberately the same call the sidebar makes when deciding whether to
    // render this page's link -- one table, so a visible link and a reachable
    // page cannot disagree. See lib/routeAccess.
    if (!canAccessRoute(authStore.get().user, "/org/leaves")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "Leave Requests — Dverif" }] }),
  component: OrgLeavesPage,
});

const PAGE_SIZE = 10;

function OrgLeavesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isStaff =
    user?.role === "user" &&
    (user?.org_role === "org_admin" ||
      (user?.org_role === "sub_admin" && parseFeatureAccess(user.feature_access).leave));

  useEffect(() => {
    if (user && !isStaff) navigate({ to: "/dashboard" });
  }, [user, isStaff, navigate]);

  if (user && !isStaff) return null;

  return <OrgLeavesContent />;
}

function OrgLeavesContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { isLocked, isModuleFlagOff } = useOrgSubscription();
  const canDelete = user?.org_role === "org_admin";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [confirming, setConfirming] = useState<LeaveRequest | null>(null);
  const [decideAction, setDecideAction] = useState<"approved" | "rejected">("approved");
  const [typeDialog, setTypeDialog] = useState<{ open: boolean; editing: LeaveType | null }>({
    open: false,
    editing: null,
  });
  const [deletingType, setDeletingType] = useState<LeaveType | null>(null);

  const types = useQuery({
    queryKey: ["orgLeaveTypes"],
    queryFn: () => orgLeavesService.types(),
  });

  const list = useQuery({
    queryKey: ["orgLeaves", page, search, status],
    queryFn: () => orgLeavesService.list({ page, limit: PAGE_SIZE, search, status }),
  });

  const decide = useMutation({
    mutationFn: ({ uuid, decision }: { uuid: string; decision: "approved" | "rejected" }) =>
      orgLeavesService.decide(uuid, { status: decision }),
    onSuccess: (_data, vars) => {
      toast.success(
        vars.decision === "approved" ? t("orgLeaves.leaveApproved") : t("orgLeaves.leaveRejected"),
      );
      qc.invalidateQueries({ queryKey: ["orgLeaves"] });
      qc.invalidateQueries({ queryKey: ["orgLeaveAllocations"] });
      setConfirming(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("orgLeaves.failedToUpdate")),
  });

  const deleteType = useMutation({
    mutationFn: (id: number) => orgLeavesService.deleteType(id),
    onSuccess: () => {
      toast.success(t("orgLeaves.leaveTypeDeleted"));
      qc.invalidateQueries({ queryKey: ["orgLeaveTypes"] });
      setDeletingType(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("orgLeaves.failedToDelete")),
  });

  const items = list.data?.items ?? [];

  const moduleLocked = isModuleFlagOff("leave_management");
  if (moduleLocked) return <ModuleFeatureLockedCard feature="leave_management" />;

  return (
    <div>
      <PageHeader title={t("orgLeaves.title")} description={t("orgLeaves.description")} />

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">{t("orgLeaves.tabRequests")}</TabsTrigger>
          <TabsTrigger value="allocations">{t("orgLeaves.tabAllocations")}</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <Card className="border-border/70 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">{t("orgLeaves.leaveTypes")}</CardTitle>
              <Button
                size="sm"
                variant="outline"
                disabled={isLocked}
                onClick={() => setTypeDialog({ open: true, editing: null })}
              >
                {isLocked ? <Lock className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
                {isLocked ? "Subscription Required" : t("orgLeaves.addType")}
              </Button>
            </CardHeader>
            <CardContent>
              {types.isLoading ? (
                <TableSkeleton />
              ) : (types.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("orgLeaves.noTypesYet")}</p>
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {(types.data ?? []).map((lt) => (
                    <div key={lt.id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground">{lt.name}</span><span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{lt.is_paid === "no" ? "Unpaid" : "Paid"}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          disabled={isLocked}
                          onClick={() => setTypeDialog({ open: true, editing: lt })}
                        >
                          {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        </Button>
                        {canDelete ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            disabled={isLocked}
                            onClick={() => setDeletingType(lt)}
                          >
                            {isLocked ? <Lock className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4 border-border/70 shadow-none">
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
                <SearchInput
                  value={search}
                  onChange={(v) => {
                    setSearch(v);
                    setPage(1);
                  }}
                  placeholder={t("orgLeaves.searchPlaceholder")}
                />
                <Select
                  value={status || "all"}
                  onValueChange={(v) => {
                    setStatus(v === "all" ? "" : v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t("status.pending")}</SelectItem>
                    <SelectItem value="approved">{t("status.approved")}</SelectItem>
                    <SelectItem value="rejected">{t("status.rejected")}</SelectItem>
                    <SelectItem value="all">{t("orgLeaves.all")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {list.isLoading ? (
                <TableSkeleton />
              ) : items.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={CalendarClock}
                    title={t("orgLeaves.emptyTitle")}
                    description={
                      status === "pending"
                        ? t("orgLeaves.noPendingDesc")
                        : t("orgLeaves.noMatchDesc")
                    }
                  />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">S.No</TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("orgLeaves.employee")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("orgLeaves.leaveType")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("orgLeaves.dates")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("orgLeaves.days")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t("orgLeaves.status")}
                          </TableHead>
                          <TableHead className="text-right whitespace-nowrap">
                            {t("orgLeaves.actions")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((r, i) => (
                          <TableRow key={r.uuid}>
                            <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                              {(page - 1) * 10 + i + 1}
                            </TableCell>
                            <TableCell data-label="Employee" className="whitespace-nowrap">
                              <div className="text-sm font-medium text-foreground">
                                {r.employee_name ?? "—"}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {r.employee_email ?? ""}
                              </div>
                            </TableCell>
                            <TableCell data-label="Leave Type" className="whitespace-nowrap text-sm text-muted-foreground">
                              {r.leave_type_name}
                            </TableCell>
                            <TableCell data-label="Dates" className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatDate(r.start_date)} → {formatDate(r.end_date)}
                            </TableCell>
                            <TableCell data-label="Days" className="whitespace-nowrap text-sm text-foreground">
                              {countDays(r.start_date, r.end_date)}
                            </TableCell>
                            <TableCell data-label="Status" className="whitespace-nowrap">
                              <StatusBadge status={r.status} />
                            </TableCell>
                            <TableCell data-label="Actions" className="text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  aria-label={t("leaves.viewDetails", "View details")}
                                  title={t("leaves.viewDetails", "View details")}
                                  onClick={() => setSelectedLeave(r)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {r.status === "pending" ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      disabled={isLocked}
                                      onClick={() => {
                                        setDecideAction("approved");
                                        setConfirming(r);
                                      }}
                                    >
                                      {isLocked ? <Lock className="mr-1 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-success" />}
                                      {t("orgLeaves.approve")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs"
                                      disabled={isLocked}
                                      onClick={() => {
                                        setDecideAction("rejected");
                                        setConfirming(r);
                                      }}
                                    >
                                      {isLocked ? <Lock className="mr-1 h-3.5 w-3.5" /> : <XCircle className="mr-1 h-3.5 w-3.5 text-destructive" />}
                                      {t("orgLeaves.reject")}
                                    </Button>
                                  </>
                                ) : (
                                  <span className="px-2 text-xs text-muted-foreground">
                                    {formatDateTime(r.approved_at)}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Pagination
                    page={page}
                    total={list.data?.total ?? 0}
                    totalPages={list.data?.totalPages ?? 1}
                    onChange={setPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="allocations">
          <AllocationsTab />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={
          decideAction === "approved" ? t("orgLeaves.approveTitle") : t("orgLeaves.rejectTitle")
        }
        description={
          confirming
            ? decideAction === "approved"
              ? t("orgLeaves.approveDescription", {
                  name: confirming.employee_name ?? t("orgLeaves.thisEmployee"),
                  days: countDays(confirming.start_date, confirming.end_date),
                  leaveType: confirming.leave_type_name,
                  startDate: confirming.start_date,
                  endDate: confirming.end_date,
                })
              : t("orgLeaves.rejectDescription", {
                  name: confirming.employee_name ?? t("orgLeaves.thisEmployee"),
                  days: countDays(confirming.start_date, confirming.end_date),
                  leaveType: confirming.leave_type_name,
                  startDate: confirming.start_date,
                  endDate: confirming.end_date,
                })
            : undefined
        }
        confirmLabel={decideAction === "approved" ? t("common.approve") : t("common.reject")}
        destructive={decideAction === "rejected"}
        onConfirm={() =>
          confirming && decide.mutate({ uuid: confirming.uuid, decision: decideAction })
        }
      />

      <ConfirmDialog
        open={!!deletingType}
        onOpenChange={(o) => !o && setDeletingType(null)}
        title={t("orgLeaves.deleteTypeTitle")}
        description={t("orgLeaves.deleteTypeDescription", { name: deletingType?.name ?? "" })}
        onConfirm={() => deletingType && deleteType.mutate(deletingType.id)}
      />

      <LeaveTypeDialog
        open={typeDialog.open}
        editing={typeDialog.editing}
        onOpenChange={(o) => setTypeDialog({ open: o, editing: null })}
      />
      <LeaveRequestDetailsDialog
        request={selectedLeave}
        onOpenChange={(open) => !open && setSelectedLeave(null)}
      />
    </div>
  );
}

function AllocationsTab() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { isLocked } = useOrgSubscription();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [historyEmp, setHistoryEmp] = useState<string | null>(null);
  const [allocSearch, setAllocSearch] = useState("");
  const [allocDepartment, setAllocDepartment] = useState("");
  const [allocDesignation, setAllocDesignation] = useState("");

  const availableYears = Array.from(
    new Set([thisYear, thisYear - 1].concat(year)),
  ).sort((a, b) => b - a);

  const allocations = useQuery({
    queryKey: ["orgLeaveAllocations", year],
    queryFn: () => orgLeaveAllocationService.list(year),
  });

  const history = useQuery({
    queryKey: ["orgLeaveAllocationHistory", historyEmp],
    queryFn: () =>
      historyEmp ? orgLeaveAllocationService.employeeHistory(historyEmp) : Promise.resolve(null),
    enabled: !!historyEmp,
  });

  const setCell = useMutation({
    mutationFn: ({
      employee_uuid,
      leave_type_id,
      allocated_days,
    }: {
      employee_uuid: string;
      leave_type_id: number;
      allocated_days: number;
    }) =>
      orgLeaveAllocationService.set({
        employee_uuid,
        leave_type_id,
        year,
        allocated_days,
      }),
    onSuccess: () => {
      toast.success(t("orgLeaves.allocSaved"));
      qc.invalidateQueries({ queryKey: ["orgLeaveAllocations", year] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? t("orgLeaves.allocSaveFailed")),
  });

  const leaveTypes = allocations.data?.leaveTypes ?? [];
  const employees = allocations.data?.employees ?? [];

  const departments = Array.from(
    new Set(
      employees
        .map((e) => e.department?.trim())
        .filter((d): d is string => !!d),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const designations = Array.from(
    new Set(
      employees
        .map((e) => e.designation?.trim())
        .filter((d): d is string => !!d),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const query = allocSearch.trim().toLowerCase();
  const filteredEmployees = employees.filter((e) => {
    if (query && !e.full_name?.toLowerCase().includes(query)) return false;
    if (allocDepartment && e.department !== allocDepartment) return false;
    if (allocDesignation && e.designation !== allocDesignation) return false;
    return true;
  });

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="flex flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-muted-foreground" />
          {t("orgLeaves.allocTitle")}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select
            value={String(year)}
            onValueChange={(v) => {
              setYear(Number(v));
              setAllocSearch("");
              setAllocDepartment("");
              setAllocDesignation("");
            }}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">{t("orgLeaves.allocDescription")}</p>

        <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center">
          <SearchInput
            value={allocSearch}
            onChange={(v) => setAllocSearch(v)}
            placeholder={t("orgLeaves.allocSearchPlaceholder")}
          />
          <Select value={allocDepartment} onValueChange={setAllocDepartment}>
            <SelectTrigger className="w-full lg:w-48">
              <SelectValue placeholder={t("orgLeaves.allocAllDepartments")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("orgLeaves.allocAllDepartments")}</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={allocDesignation} onValueChange={setAllocDesignation}>
            <SelectTrigger className="w-full lg:w-48">
              <SelectValue placeholder={t("orgLeaves.allocAllDesignations")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{t("orgLeaves.allocAllDesignations")}</SelectItem>
              {designations.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {allocations.isLoading ? (
          <TableSkeleton />
        ) : leaveTypes.length === 0 ? (
          <EmptyState
            icon={CalendarPlus}
            title={t("orgLeaves.noTypesYet")}
            description={t("orgLeaves.allocNoTypesDesc")}
          />
        ) : employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("orgLeaves.allocNoEmployees")}
            description={t("orgLeaves.allocNoEmployeesDesc")}
          />
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("orgLeaves.emptyTitle")}
            description={t("orgLeaves.allocNoMatchEmployees")}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px] whitespace-nowrap">
                    {t("orgLeaves.employee")}
                  </TableHead>
                  {leaveTypes.map((lt) => (
                    <TableHead key={lt.id} className="min-w-[110px] whitespace-nowrap">
                      {lt.name}
                    </TableHead>
                  ))}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((emp) => (
                  <TableRow key={emp.employee_uuid}>
                    <TableCell data-label="Employee" className="whitespace-nowrap">
                      <div className="text-sm font-medium text-foreground">{emp.full_name}</div>
                      <div className="text-xs text-muted-foreground">{emp.email}</div>
                    </TableCell>
                    {emp.allocations.map((a) => {
                      const cellsState =
                        setCell.variables &&
                        setCell.variables.employee_uuid === emp.employee_uuid &&
                        setCell.variables.leave_type_id === a.leave_type_id &&
                        setCell.isPending
                          ? setCell.variables.allocated_days
                          : null;
                      return (
                        <TableCell
                          key={a.leave_type_id}
                          data-label={leaveTypes.find((lt) => lt.id === a.leave_type_id)?.name ?? ""}
                          className="whitespace-nowrap"
                        >
                          <AllocationCell
                            value={a.allocated_days}
                            remaining={a.remaining_days}
                            busy={cellsState !== null}
                            locked={isLocked}
                            onCommit={(val) =>
                              setCell.mutate({
                                employee_uuid: emp.employee_uuid,
                                leave_type_id: a.leave_type_id,
                                allocated_days: val,
                              })
                            }
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell data-label="History">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => setHistoryEmp(emp.employee_uuid)}
                        title={t("orgLeaves.viewHistory")}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <HistoryDialog
        empUuid={historyEmp}
        onClose={() => setHistoryEmp(null)}
        history={history.data}
        isLoading={history.isLoading}
      />
    </Card>
  );
}

function AllocationCell({
  value,
  remaining,
  busy,
  locked,
  onCommit,
}: {
  value: number;
  remaining: number;
  busy: boolean;
  locked?: boolean;
  onCommit: (allocated_days: number) => void;
}) {
  const [local, setLocal] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  const commit = () => {
    setEditing(false);
    const v = parseInt(local, 10);
    if (isNaN(v) || v < 0 || v === value) {
      setLocal(String(value));
      return;
    }
    onCommit(v);
  };

  return (
    <div className="flex flex-col gap-0.5">
      <input
        type="number"
        min={0}
        value={editing ? local : String(value)}
        onChange={(e) => {
          setLocal(e.target.value);
          setEditing(true);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={busy || locked}
        className="h-7 w-20 rounded-md border border-border bg-transparent px-2 text-sm text-foreground outline-none focus:border-ring disabled:opacity-50"
      />
      <span
        className={`text-[10px] leading-none ${
          remaining <= 0 ? "text-amber-600" : "text-muted-foreground"
        }`}
      >
        {remaining} {remaining === 1 ? "day left" : "days left"}
      </span>
    </div>
  );
}

function HistoryDialog({
  empUuid,
  onClose,
  history,
  isLoading,
}: {
  empUuid: string | null;
  onClose: () => void;
  history:
    | {
        employee_name: string;
        allocations: {
          year: number;
          allocated_days: number;
          used_days: number;
          remaining_days: number;
          leave_type_name: string;
        }[];
      }
    | null
    | undefined;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={!!empUuid} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {history?.employee_name ?? t("orgLeaves.employee")} —{" "}
            {t("orgLeaves.allocHistoryTitle")}
          </DialogTitle>
          <DialogDescription>{t("orgLeaves.allocHistoryDescription")}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <TableSkeleton />
        ) : !history || history.allocations.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("orgLeaves.allocNoHistory")}</p>
        ) : (
          <div className="max-h-[50vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">{t("orgLeaves.year")}</TableHead>
                  <TableHead className="whitespace-nowrap">
                    {t("orgLeaves.leaveType")}
                  </TableHead>
                  <TableHead className="whitespace-nowrap">{t("orgLeaves.allocated")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("orgLeaves.used")}</TableHead>
                  <TableHead className="whitespace-nowrap">{t("orgLeaves.remaining")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.allocations.map((a, i) => (
                  <TableRow key={`${a.year}-${a.leave_type_name}-${i}`}>
                    <TableCell data-label="Year" className="whitespace-nowrap text-sm text-foreground">
                      {a.year}
                    </TableCell>
                    <TableCell data-label="Leave Type" className="whitespace-nowrap text-sm text-muted-foreground">
                      {a.leave_type_name}
                    </TableCell>
                    <TableCell data-label="Allocated" className="whitespace-nowrap text-sm text-foreground">
                      {a.allocated_days}
                    </TableCell>
                    <TableCell data-label="Used" className="whitespace-nowrap text-sm text-muted-foreground">
                      {a.used_days}
                    </TableCell>
                    <TableCell data-label="Remaining" className="whitespace-nowrap text-sm text-foreground">
                      {a.remaining_days}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTypeDialog({
  open,
  editing,
  onOpenChange,
}: {
  open: boolean;
  editing: LeaveType | null;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [isPaid, setIsPaid] = useState<"" | "yes" | "no">("");

  useEffect(() => {
    if (open) { setName(editing?.name ?? ""); setIsPaid(editing?.is_paid ?? ""); }
  }, [open, editing]);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? orgLeavesService.updateType(editing.id, { name, is_paid: isPaid as "yes" | "no" })
        : orgLeavesService.createType({ name, is_paid: isPaid as "yes" | "no" }),
    onSuccess: () => {
      toast.success(editing ? t("orgLeaves.leaveTypeUpdated") : t("orgLeaves.leaveTypeCreated"));
      qc.invalidateQueries({ queryKey: ["orgLeaveTypes"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("orgLeaves.failedToSave")),
  });

  const submit = () => {
    if (!name.trim()) return toast.error(t("orgLeaves.nameRequired"));
    if (!isPaid) return toast.error("Select whether this leave is paid or unpaid.");
    save.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {editing ? t("orgLeaves.editLeaveType") : t("orgLeaves.addLeaveType")}
          </DialogTitle>
          <DialogDescription>{t("orgLeaves.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lt-name">{t("orgLeaves.name")}</Label>
            <Input
              id="lt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("orgLeaves.namePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lt-paid-status">Payroll treatment</Label>
            <Select value={isPaid} onValueChange={(v) => setIsPaid(v as "yes" | "no")}>
              <SelectTrigger id="lt-paid-status"><SelectValue placeholder="Choose paid or unpaid" /></SelectTrigger>
              <SelectContent><SelectItem value="yes">Paid leave ? does not reduce base salary</SelectItem><SelectItem value="no">Unpaid leave ? eligible for policy-based deduction</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
