import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { CalendarPlus, CalendarX2, Eye, Lock } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableSkeleton } from "./_app.requests";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { leavesService, type LeaveRequest } from "@/services";
import { countDays, formatDate, formatDateTime } from "@/lib/utils";
import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { ModuleFeatureLockedCard } from "@/components/common/SubscriptionLocked";
import { LeaveRequestDetailsDialog } from "@/components/leaves/LeaveRequestDetailsDialog";
import { LeaveReasonEditor } from "@/components/leaves/LeaveReasonEditor";
import { FormattedLeaveReason } from "@/components/leaves/FormattedLeaveReason";

export const Route = createFileRoute("/_app/leaves")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Self-service leave is employee-only server-side. This used to be a
    // useEffect in the component that only bounced org_admin, so a sub_admin
    // who typed the URL got the page and a wall of 403s instead of a redirect.
    if (!canAccessRoute(authStore.get().user, "/leaves")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "Leaves — Dverif" }] }),
  component: LeavesContent,
});

const PAGE_SIZE = 10;

function LeavesContent() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { isLocked, isModuleFlagOff } = useOrgSubscription();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);

  const balance = useQuery({
    queryKey: ["myLeaveBalance"],
    queryFn: () => leavesService.balance(),
  });

  const history = useQuery({
    queryKey: ["myLeaves", page, status, dateFrom, dateTo],
    queryFn: () => leavesService.mine({ page, limit: PAGE_SIZE, status: status || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
  });

  const items = history.data?.items ?? [];
  const balances = balance.data ?? [];

  const moduleLocked = isModuleFlagOff("leave_management");
  if (moduleLocked) return <ModuleFeatureLockedCard feature="leave_management" />;

  return (
    <div>
      <PageHeader
        title={t("nav.leaves")}
        description={t("leaves.description")}
        actions={
          <Button disabled={isLocked} onClick={() => setApplyOpen(true)}>
            {isLocked ? <Lock className="mr-2 h-4 w-4" /> : <CalendarPlus className="mr-2 h-4 w-4" />}
            {isLocked ? "Subscription Required" : t("leaves.applyForLeave")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {balances.length === 0 ? (
          <Card className="border-border/70 shadow-none sm:col-span-2 lg:col-span-4">
            <CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground">
              <CalendarX2 className="h-4 w-4 shrink-0" />
              {t("leaves.noTypesConfigured")}
            </CardContent>
          </Card>
        ) : (
          balances.map((b) => (
            <Card key={b.id} className="border-border/70 shadow-none">
              <CardContent className="p-4">
                <div className="text-sm font-medium text-foreground">{b.leave_type_name}</div>
                <div className="mt-2 flex items-end justify-between">
                  <div>
                    <div className="text-2xl font-semibold text-foreground">
                      {b.remaining}
                      <span className="text-sm font-normal text-muted-foreground">
                        {" "}
                        / {b.total_allocated}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("leaves.daysAvailable", { year: b.year })}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("leaves.usedCount", { count: b.used })}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="mt-4 mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={status || "all"} onValueChange={(value) => { setStatus(value === "all" ? "" : value); setPage(1); }}>
          <SelectTrigger><SelectValue placeholder={t("leaves.status", "Status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.allStatuses", "All statuses")}</SelectItem>
            <SelectItem value="pending">{t("status.pending", "Pending")}</SelectItem>
            <SelectItem value="approved">{t("status.approved", "Approved")}</SelectItem>
            <SelectItem value="rejected">{t("status.rejected", "Rejected")}</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" aria-label={t("leaves.fromDate", "From date")} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
        <Input type="date" aria-label={t("leaves.toDate", "To date")} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
        {(status || dateFrom || dateTo) && <Button variant="outline" onClick={() => { setStatus(""); setDateFrom(""); setDateTo(""); setPage(1); }}>{t("common.clear", "Clear")}</Button>}
      </div>
      <Card className="mt-4 border-border/70 shadow-none">
        <CardContent className="p-0">
          {history.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CalendarX2}
                title={t("leaves.noRequests")}
                description={t("leaves.noRequestsDesc")}
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">S.No</TableHead>
                      <TableHead className="whitespace-nowrap">{t("leaves.leaveType")}</TableHead>
                      <TableHead className="whitespace-nowrap">{t("leaves.dates")}</TableHead>
                      <TableHead className="whitespace-nowrap">{t("leaves.days")}</TableHead>
                      <TableHead className="whitespace-nowrap">{t("leaves.status")}</TableHead>
                      <TableHead className="whitespace-nowrap">{t("leaves.submitted")}</TableHead>
                      <TableHead className="text-right whitespace-nowrap">{t("common.actions", "Actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((r, i) => (
                      <TableRow key={r.uuid}>
                        <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                          {(page - 1) * 10 + i + 1}
                        </TableCell>
                        <TableCell data-label="Leave type" className="whitespace-nowrap font-medium text-foreground">
                          {r.leave_type_name}
                          {r.reason && (
                            <div className="mt-0.5 max-w-[240px] truncate text-xs font-normal text-muted-foreground">
                              <FormattedLeaveReason text={r.reason} />
                            </div>
                          )}
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
                        <TableCell data-label="Submitted" className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(r.created_at)}
                        </TableCell>
                        <TableCell data-label="Actions" className="text-right">
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={page}
                total={history.data?.total ?? 0}
                totalPages={history.data?.totalPages ?? 1}
                onChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} />
      <LeaveRequestDetailsDialog
        request={selectedLeave}
        onOpenChange={(open) => !open && setSelectedLeave(null)}
      />
    </div>
  );
}

function ApplyLeaveDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [leaveTypeId, setLeaveTypeId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const types = useQuery({
    queryKey: ["myLeaveTypes"],
    queryFn: () => leavesService.types(),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      leavesService.create({
        leave_type_id: Number(leaveTypeId),
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success(t("leaves.requestSubmitted"));
      qc.invalidateQueries({ queryKey: ["myLeaves"] });
      qc.invalidateQueries({ queryKey: ["myLeaveBalance"] });
      setLeaveTypeId("");
      setStartDate("");
      setEndDate("");
      setReason("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("leaves.submitFailed")),
  });

  const days = startDate && endDate ? countDays(startDate, endDate) : 0;

  const submit = () => {
    if (!leaveTypeId) return toast.error(t("leaves.selectLeaveType"));
    if (!startDate || !endDate) return toast.error(t("leaves.selectDates"));
    if (endDate < startDate) return toast.error(t("leaves.endDateBeforeStart"));
    const reasonText = reason.replace(/\*\*/g, "").replace(/__/g, "").trim();
    if (!reasonText) return toast.error(t("leaves.reasonRequired"));
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("leaves.applyForLeave")}</DialogTitle>
          <DialogDescription>{t("leaves.dialogDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>{t("leaves.leaveType")}</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger>
                <SelectValue placeholder={t("leaves.selectLeaveTypePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(types.data ?? []).map((lt) => (
                  <SelectItem key={lt.id} value={String(lt.id)}>
                    {lt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="leave-start">{t("leaves.startDate")}</Label>
              <Input
                id="leave-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="leave-end">{t("leaves.endDate")}</Label>
              <Input
                id="leave-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {days > 0 && (
            <p className="text-xs text-muted-foreground">
              {t("leaves.daysRequested", { count: days })}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="leave-reason">{t("leaves.reason")} <span className="text-destructive">*</span></Label>
            <LeaveReasonEditor
              id="leave-reason"
              value={reason}
              onChange={setReason}
              placeholder={t("leaves.reasonPlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {t("leaves.submitRequest")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
