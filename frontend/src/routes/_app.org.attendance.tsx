import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Info, Lock, Plus, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { useAuth } from "@/lib/auth";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { ModuleFeatureLockedCard } from "@/components/common/SubscriptionLocked";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableSkeleton } from "./_app.requests";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orgAttendanceService, orgService, isCurrentEmployee } from "@/services";
import { apiErrorMessage, formatDate, formatDateTime, parseFeatureAccess } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/attendance")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Deliberately the same call the sidebar makes when deciding whether to
    // render this page's link -- one table, so a visible link and a reachable
    // page cannot disagree. See lib/routeAccess.
    if (!canAccessRoute(authStore.get().user, "/org/attendance")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "Attendance — Dverif" }] }),
  component: OrgAttendancePage,
});

const PAGE_SIZE = 10;

/** Local YYYY-MM-DD. toISOString() would shift the day in any timezone behind UTC. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function OrgAttendancePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isStaff =
    user?.role === "user" &&
    (user?.org_role === "org_admin" ||
      (user?.org_role === "sub_admin" && parseFeatureAccess(user.feature_access).attendance));

  useEffect(() => {
    if (user && !isStaff) navigate({ to: "/dashboard" });
  }, [user, isStaff, navigate]);

  if (user && !isStaff) return null;

  return <OrgAttendanceContent />;
}

function OrgAttendanceContent() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { isLocked, isModuleFlagOff } = useOrgSubscription();
  const canDelete = user?.org_role === "org_admin";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ipInput, setIpInput] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  const ips = useQuery({
    queryKey: ["orgAllowedIps"],
    queryFn: () => orgAttendanceService.ips(),
  });

  const records = useQuery({
    queryKey: ["orgAttendance", page, search, status, dateFrom, dateTo],
    queryFn: () =>
      orgAttendanceService.list({
        page,
        limit: PAGE_SIZE,
        search,
        status: status || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const addIp = useMutation({
    mutationFn: (ip: string) => orgAttendanceService.addIp(ip),
    onSuccess: () => {
      toast.success(t("attendance.ipAdded"));
      qc.invalidateQueries({ queryKey: ["orgAllowedIps"] });
      setIpInput("");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("attendance.addIpFailed")),
  });

  const removeIp = useMutation({
    mutationFn: (id: number) => orgAttendanceService.removeIp(id),
    onSuccess: () => {
      toast.success(t("attendance.ipRemoved"));
      qc.invalidateQueries({ queryKey: ["orgAllowedIps"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("attendance.removeIpFailed")),
  });

  const items = records.data?.items ?? [];
  const rules = ips.data?.rules ?? [];

  const moduleLocked = isModuleFlagOff("attendance_management");
  if (moduleLocked) return <ModuleFeatureLockedCard feature="attendance_management" />;

  return (
    <div>
      <PageHeader title={t("nav.attendance")} description={t("attendance.description")} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => setManualOpen(true)}
          disabled={isLocked}
          title="Record attendance for an employee manually"
        >
          {isLocked ? <Lock className="mr-1 h-3 w-3" /> : <UserCheck className="mr-1 h-3 w-3" />}
          {isLocked ? "Subscription Required" : "Mark attendance"}
        </Button>
      </div>

      <ManualAttendanceDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        disabled={isLocked}
        onDone={() => {
          setManualOpen(false);
          setPage(1);
          qc.invalidateQueries({ queryKey: ["orgAttendance"] });
        }}
      />

      <Card className="border-border/70 shadow-none">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {t("attendance.allowedIpsTitle")}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={t("attendance.aboutIpRestriction")}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{t("attendance.ipTooltip")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={ipInput}
              onChange={(e) => setIpInput(e.target.value)}
              placeholder="e.g. 192.168.1.0/24 or 203.0.113.5"
              className="sm:max-w-xs"
              disabled={isLocked}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ipInput.trim()) addIp.mutate(ipInput.trim());
              }}
            />
            <Button
              size="sm"
              onClick={() => addIp.mutate(ipInput.trim())}
              disabled={isLocked || !ipInput.trim() || addIp.isPending}
            >
              {isLocked ? <Lock className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
              {isLocked ? "Subscription Required" : t("attendance.addIp")}
            </Button>
          </div>
          {rules.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("attendance.noIpsMessage")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rules.map((rule) => (
                <span
                  key={rule.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-foreground"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-success" />
                  {rule.ip_address}
                  {canDelete ? (
                    <button
                      type="button"
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      onClick={() => removeIp.mutate(rule.id)}
                      disabled={isLocked || removeIp.isPending}
                      aria-label={t("attendance.removeIpLabel", { ip: rule.ip_address })}
                    >
                      {isLocked ? <Lock className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 border-border/70 shadow-none">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder={t("attendance.searchEmployee")}
            />
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full lg:w-40">
                <SelectValue placeholder={t("attendance.allStatuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t("attendance.allStatuses")}</SelectItem>
                <SelectItem value="checked_in">{t("status.checked_in")}</SelectItem>
                <SelectItem value="checked_out">{t("status.checked_out")}</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:w-auto">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full min-w-0 lg:w-40"
              />
              <span className="text-xs text-muted-foreground">{t("common.to")}</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full min-w-0 lg:w-40"
              />
            </div>
          </div>

          {records.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ShieldCheck}
                title={t("attendance.emptyTitle")}
                description={t("attendance.emptyDesc")}
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
                        {t("attendance.employee")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">{t("attendance.date")}</TableHead>
                      <TableHead className="whitespace-nowrap">{t("attendance.checkIn")}</TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("attendance.checkOut")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">{t("attendance.status")}</TableHead>
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
                        <TableCell data-label="Date" className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(r.date)}
                        </TableCell>
                        <TableCell data-label="Check In" className="whitespace-nowrap text-sm text-muted-foreground">
                          {r.check_in_at ? formatDateTime(r.check_in_at) : "—"}
                          {r.check_in_ip && (
                            <div className="text-xs text-muted-foreground/70">{r.check_in_ip}</div>
                          )}
                        </TableCell>
                        <TableCell data-label="Check Out" className="whitespace-nowrap text-sm text-muted-foreground">
                          {r.check_out_at ? formatDateTime(r.check_out_at) : "—"}
                          {r.check_out_ip && (
                            <div className="text-xs text-muted-foreground/70">{r.check_out_ip}</div>
                          )}
                        </TableCell>
                        <TableCell data-label="Status" className="whitespace-nowrap">
                          <StatusBadge status={r.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={page}
                total={records.data?.total ?? 0}
                totalPages={records.data?.totalPages ?? 1}
                onChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Back-office attendance entry.
 *
 * The self-service check-in is gated by the IP allowlist, which silently
 * strands anyone whose device sits behind a dynamic IP or who is working
 * off-site. This dialog is the escape hatch. It mirrors the backend's rules
 * rather than discovering them on submit: a reason is mandatory, the checkout
 * must be after the check-in, and the date cannot be in the future.
 */
function ManualAttendanceDialog({
  open,
  onOpenChange,
  disabled,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  disabled?: boolean;
  onDone: () => void;
}) {
  const [employeeUuid, setEmployeeUuid] = useState("");
  const [date, setDate] = useState(localToday());
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const employees = useQuery({
    queryKey: ["manual-attendance-employees"],
    queryFn: () => orgService.employees({ page: 1, limit: 1000 }),
    enabled: open,
  });

  // The backend rejects the org admin's own row, so offering it would be a
  // guaranteed dead end.
  const options = useMemo(
    () => (employees.data?.items ?? []).filter((e) => isCurrentEmployee(e.status)),
    [employees.data],
  );

  const submit = useMutation({
    mutationFn: () =>
      orgAttendanceService.manualEntry({
        employee_uuid: employeeUuid,
        date,
        check_in_time: checkIn,
        check_out_time: checkOut || undefined,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast.success("Attendance recorded");
      setEmployeeUuid("");
      setCheckIn("");
      setCheckOut("");
      setReason("");
      setErrors({});
      setDate(localToday());
      onDone();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not record attendance")),
  });

  const handleSubmit = () => {
    const next: Record<string, string> = {};
    if (!employeeUuid) next.employeeUuid = "Choose an employee";
    if (!date) next.date = "Date is required";
    else if (date > localToday()) next.date = "Cannot be a future date";
    if (!/^\d{2}:\d{2}$/.test(checkIn)) next.checkIn = "Check-in time is required";
    if (checkOut && !/^\d{2}:\d{2}$/.test(checkOut)) next.checkOut = "Use HH:MM";
    else if (checkOut && checkIn && checkOut <= checkIn)
      next.checkOut = "Must be after the check-in time";
    if (!reason.trim()) next.reason = "A reason is required for a manual entry";
    setErrors(next);
    if (Object.keys(next).length === 0) submit.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark attendance</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Employee *</Label>
            <Select value={employeeUuid} onValueChange={(v) => setEmployeeUuid(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {options.map((e) => (
                  <SelectItem key={e.uuid} value={e.uuid}>
                    {e.full_name}
                    {e.employee_code ? ` (${e.employee_code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.employeeUuid ? (
              <p className="text-xs text-destructive">{errors.employeeUuid}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input
              type="date"
              value={date}
              max={localToday()}
              onChange={(e) => setDate(e.target.value)}
            />
            {errors.date ? <p className="text-xs text-destructive">{errors.date}</p> : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Check in *</Label>
              <Input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              {errors.checkIn ? (
                <p className="text-xs text-destructive">{errors.checkIn}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Check out</Label>
              <Input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
              {errors.checkOut ? (
                <p className="text-xs text-destructive">{errors.checkOut}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea
              value={reason}
              rows={2}
              placeholder="e.g. Field visit — device had no access to the office network"
              onChange={(e) => setReason(e.target.value)}
            />
            {errors.reason ? <p className="text-xs text-destructive">{errors.reason}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submit.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submit.isPending} disabled={disabled}>
            Save entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
