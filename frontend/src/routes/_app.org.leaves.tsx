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
  const [employeeUuid, setEmployeeUuid] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [confirming, setConfirming] = useState<LeaveRequest | null>(null);
  const [decideAction, setDecideAction] = useState<"approved" | "rejected">("approved");
  const [approvalTreatment, setApprovalTreatment] = useState<"paid" | "unpaid">("unpaid");
  const [typeDialog, setTypeDialog] = useState<{ open: boolean; editing: LeaveType | null }>({
    open: false,
    editing: null,
  });
  const [deletingType, setDeletingType] = useState<LeaveType | null>(null);
  const [visibleLeaveTypes, setVisibleLeaveTypes] = useState(5);

  const employees = useQuery({ queryKey: ["orgLeaveFilterEmployees"], queryFn: () => orgService.employees({ page: 1, limit: 1000 }) });

  const types = useQuery({
    queryKey: ["orgLeaveTypes"],
    queryFn: () => orgLeavesService.types(),
  });

  const list = useQuery({
    queryKey: ["orgLeaves", page, search, status, employeeUuid, leaveTypeId],
    queryFn: () => orgLeavesService.list({ page, limit: PAGE_SIZE, search, status, employee_uuid: employeeUuid || undefined, leave_type_id: leaveTypeId ? Number(leaveTypeId) : undefined, include_all: true }),
  });

  const decide = useMutation({
    mutationFn: ({ uuid, decision, treatment }: { uuid: string; decision: "approved" | "rejected"; treatment?: "paid" | "unpaid" }) =>
      orgLeavesService.decide(uuid, { status: decision, approved_treatment: treatment }),
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
                  {(types.data ?? []).slice(0, visibleLeaveTypes).map((lt) => (
                    <div key={lt.id} className="flex items-center justify-between px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground">{lt.name}</span>
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
              {(types.data ?? []).length > visibleLeaveTypes ? (
                <div className="mt-3 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleLeaveTypes((current) => current + 5)}
                  >
                    Show more ({Math.min(5, (types.data ?? []).length - visibleLeaveTypes)})
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="mt-4 border-border/70 shadow-none">
            <CardContent className="p-0">
              <div className="grid min-w-0 grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-8">
                <div className="min-w-0 sm:col-span-2 xl:col-span-3 [&>div]:!w-full">
                  <SearchInput
                    value={search}
                    onChange={(v) => {
                      setSearch(v);
                      setPage(1);
                    }}
                    placeholder={t("orgLeaves.searchPlaceholder")}
                  />
                </div>
                <div className="min-w-0 xl:col-span-2">
                  <Select value={employeeUuid || "all"} onValueChange={(v) => { setEmployeeUuid(v === "all" ? "" : v); setPage(1); }}>
                    <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="All employees" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All employees</SelectItem>{(employees.data?.items ?? []).map((e) => <SelectItem key={e.uuid} value={e.uuid}>{e.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 xl:col-span-2">
                  <Select value={leaveTypeId || "all"} onValueChange={(v) => { setLeaveTypeId(v === "all" ? "" : v); setPage(1); }}>
                    <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="All leave types" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All leave types</SelectItem>{(types.data ?? []).map((lt) => <SelectItem key={lt.id} value={String(lt.id)}>{lt.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="min-w-0 xl:col-span-2">
                <Select
                  value={status || "all"}
                  onValueChange={(v) => {
                    setStatus(v === "all" ? "" : v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full min-w-0">
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
                              {r.working_days ?? countDays(r.start_date, r.end_date)}
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
                                        setApprovalTreatment(r.requested_treatment ?? "unpaid");
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

      <Dialog open={!!confirming && decideAction === "approved"} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Approve leave request</DialogTitle><DialogDescription>Choose whether this leave will be paid or unpaid in payroll.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="leave-approval-treatment">Leave payment</Label>
            <Select value={approvalTreatment} onValueChange={(value) => setApprovalTreatment(value as "paid" | "unpaid")}>
              <SelectTrigger id="leave-approval-treatment"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button><Button onClick={() => confirming && decide.mutate({ uuid: confirming.uuid, decision: "approved", treatment: approvalTreatment })} disabled={decide.isPending}>Confirm Approval</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!confirming && decideAction === "rejected"}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={
          decideAction === "approved" ? t("orgLeaves.approveTitle") : t("orgLeaves.rejectTitle")
        }
        description={
          confirming
            ? decideAction === "approved"
              ? t("orgLeaves.approveDescription", {
                  name: confirming.employee_name ?? t("orgLeaves.thisEmployee"),
                  days: confirming.working_days ?? countDays(confirming.start_date, confirming.end_date),
                  leaveType: confirming.leave_type_name,
                  startDate: confirming.start_date,
                  endDate: confirming.end_date,
                })
              : t("orgLeaves.rejectDescription", {
                  name: confirming.employee_name ?? t("orgLeaves.thisEmployee"),
                  days: confirming.working_days ?? countDays(confirming.start_date, confirming.end_date),
                  leaveType: confirming.leave_type_name,
                  startDate: confirming.start_date,
                  endDate: confirming.end_date,
                })
            : undefined
        }
        confirmLabel={t("common.reject")}
        destructive
        onConfirm={() =>
          confirming && decide.mutate({ uuid: confirming.uuid, decision: "rejected" })
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
  const [bulkLeaveType, setBulkLeaveType] = useState("");
  const [bulkDays, setBulkDays] = useState("");

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

  const setDesignationAllocation = useMutation({
    mutationFn: () =>
      orgLeaveAllocationService.setByDesignation({
        designation_uuid: allocDesignation,
        leave_type_id: Number(bulkLeaveType),
        year,
        allocated_days: Number(bulkDays),
      }),
    onSuccess: (result) => {
      toast.success(t("orgLeaves.allocBulkSaved", { count: result.employee_count }));
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

  const designations = allocations.data?.designations ?? [];

  const query = allocSearch.trim().toLowerCase();
  const filteredEmployees = employees.filter((e) => {
    if (query && !e.full_name?.toLowerCase().includes(query)) return false;
    if (allocDepartment && e.department !== allocDepartment) return false;
    if (allocDesignation && e.designation_uuid !== allocDesignation) return false;
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
              setBulkLeaveType("");
              setBulkDays("");
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
                <SelectItem key={d.uuid} value={d.uuid}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-end">
          <div className="min-w-48 flex-1">
            <Label className="mb-1.5 block text-xs">{t("orgLeaves.allocBulkType")}</Label>
            <Select value={bulkLeaveType} onValueChange={setBulkLeaveType}>
              <SelectTrigger><SelectValue placeholder={t("orgLeaves.allocBulkTypePlaceholder")} /></SelectTrigger>
              <SelectContent>
                {leaveTypes.map((lt) => <SelectItem key={lt.id} value={String(lt.id)}>{lt.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-32">
            <Label htmlFor="designation-allocation-days" className="mb-1.5 block text-xs">{t("orgLeaves.allocated")}</Label>
            <Input id="designation-allocation-days" type="number" min={0} step={1} value={bulkDays} onChange={(e) => setBulkDays(e.target.value)} />
          </div>
          <Button
            type="button"
            disabled={isLocked || !allocDesignation || !bulkLeaveType || bulkDays === "" || !/^\d+$/.test(bulkDays) || setDesignationAllocation.isPending}
            onClick={() => setDesignationAllocation.mutate()}
          >
            {setDesignationAllocation.isPending ? t("orgLeaves.allocBulkSaving") : t("orgLeaves.allocBulkApply")}
          </Button>
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
                      return (
                        <TableCell
                          key={a.leave_type_id}
                          data-label={leaveTypes.find((lt) => lt.id === a.leave_type_id)?.name ?? ""}
                          className="whitespace-nowrap"
                        >
                          <div className="text-sm font-medium text-foreground">{a.allocated_days}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {a.remaining_days} {a.remaining_days === 1 ? "day" : "days"} left
                          </div>
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
        balances: {
          year: number;
          allocated_days: number;
          used_days: number;
          remaining_days: number;
          leave_type_name: string;
        }[];
        leave_history: {
          uuid: string;
          leave_type_name: string;
          start_date: string;
          end_date: string;
          days: number;
          status: "pending" | "approved" | "rejected";
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
        ) : !history || (history.balances.length === 0 && history.leave_history.length === 0) ? (
          <p className="text-sm text-muted-foreground">{t("orgLeaves.allocNoHistory")}</p>
        ) : (
          <div className="max-h-[55vh] space-y-4 overflow-auto">
            {history.balances.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {history.balances.map((balance) => (
                  <div
                    key={`${balance.year}-${balance.leave_type_name}`}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <div className="font-medium text-foreground">
                      {balance.leave_type_name} · {balance.year}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Used: {balance.used_days} · Remaining: {balance.remaining_days}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {history.leave_history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leave requests recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t("orgLeaves.leaveType")}</TableHead>
                    <TableHead className="whitespace-nowrap">From</TableHead>
                    <TableHead className="whitespace-nowrap">To</TableHead>
                    <TableHead className="whitespace-nowrap">Days</TableHead>
                    <TableHead className="whitespace-nowrap">{t("orgLeaves.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.leave_history.map((leave) => (
                    <TableRow key={leave.uuid}>
                      <TableCell className="whitespace-nowrap">{leave.leave_type_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(leave.start_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(leave.end_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{leave.days}</TableCell>
                      <TableCell className="whitespace-nowrap capitalize">{leave.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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

  useEffect(() => {
    if (open) setName(editing?.name ?? "");
  }, [open, editing]);

  const save = useMutation({
    mutationFn: () =>
      editing
        ? orgLeavesService.updateType(editing.id, { name })
        : orgLeavesService.createType({ name }),
    onSuccess: () => {
      toast.success(editing ? t("orgLeaves.leaveTypeUpdated") : t("orgLeaves.leaveTypeCreated"));
      qc.invalidateQueries({ queryKey: ["orgLeaveTypes"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("orgLeaves.failedToSave")),
  });

  const submit = () => {
    if (!name.trim()) return toast.error(t("orgLeaves.nameRequired"));
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
