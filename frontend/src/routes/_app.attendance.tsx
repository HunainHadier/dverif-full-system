import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/attendance")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Self-service check-in/out is employee-only server-side, and the sidebar
    // hides this page from staff via the same table.
    if (!canAccessRoute(authStore.get().user, "/attendance")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AttendancePage,
});

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { LogIn, LogOut, Clock, CalendarDays, Lock } from "lucide-react";
import { attendanceService, type AttendanceRecord } from "@/services";
import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { ModuleFeatureLockedCard } from "@/components/common/SubscriptionLocked";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/routes/_app.requests";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { apiErrorMessage } from "@/lib/utils";
import { DecisionResultDialog } from "@/components/common/DecisionResultDialog";

function AttendancePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { isLocked, isModuleFlagOff } = useOrgSubscription();
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("");
  const [attendanceResult, setAttendanceResult] = useState<"checkIn" | "checkOut" | null>(null);
  const [pendingAction, setPendingAction] = useState<"checkIn" | "checkOut" | null>(null);

  const today = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () => attendanceService.today(),
    refetchInterval: 30_000,
  });

  const history = useQuery({
    queryKey: ["attendance-history", page, dateFrom, dateTo, status],
    queryFn: () => attendanceService.history({ page, limit: 10, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, status: status || undefined }),
  });

  const record = today.data?.record;

  const doCheckIn = async () => {
    if (pendingAction) return;
    setPendingAction("checkIn");
    try {
      await attendanceService.checkIn();
      setAttendanceResult("checkIn");
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
    } catch (e) {
      toast.error(apiErrorMessage(e, t("orgAttendance.checkInFailed")));
    } finally {
      setPendingAction(null);
    }
  };

  const doCheckOut = async () => {
    if (pendingAction) return;
    setPendingAction("checkOut");
    try {
      await attendanceService.checkOut();
      setAttendanceResult("checkOut");
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
    } catch (e) {
      toast.error(apiErrorMessage(e, t("orgAttendance.checkOutFailed")));
    } finally {
      setPendingAction(null);
    }
  };

  const moduleLocked = isModuleFlagOff("attendance_management");
  if (moduleLocked) return <ModuleFeatureLockedCard feature="attendance_management" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("orgAttendance.title", "Attendance")}
        description={t("orgAttendance.description", "Check in and view your attendance history")}
      />

      <Card className="border-border/70 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            {t("orgAttendance.today", "Today's Status")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {record ? (
              <Badge
                variant="outline"
                className={
                  record.status === "checked_out"
                    ? "rounded-full border-success/30 bg-success/10 text-success"
                    : "rounded-full border-primary/30 bg-primary/10 text-primary"
                }
              >
                {record.status === "checked_out" ? t("orgAttendance.checkedOut") : t("orgAttendance.checkedIn")}
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="rounded-full border-border text-muted-foreground"
              >
                {t("orgAttendance.notCheckedIn")}
              </Badge>
            )}

            <div className="flex-1" />

            {!record ? (
              <Button
                onClick={doCheckIn}
                disabled={isLocked || pendingAction !== null}
                loading={pendingAction === "checkIn"}
              >
                {isLocked ? <Lock className="mr-2 h-4 w-4" /> : <LogIn className="mr-2 h-4 w-4" />}
                {isLocked ? "Subscription Required" : t("orgAttendance.checkIn", "Check In")}
              </Button>
            ) : record.status === "checked_in" ? (
              <Button
                variant="destructive"
                onClick={doCheckOut}
                disabled={isLocked || pendingAction !== null}
                loading={pendingAction === "checkOut"}
              >
                {isLocked ? <Lock className="mr-2 h-4 w-4" /> : <LogOut className="mr-2 h-4 w-4" />}
                {isLocked ? "Subscription Required" : t("orgAttendance.checkOut", "Check Out")}
              </Button>
            ) : null}
          </div>
          {record && (
            <div className="mt-3 flex gap-6 text-sm text-muted-foreground">
              <span>{t("orgAttendance.in")}: {formatDateTime(record.check_in_at)}</span>
              {record.check_out_at && (
                <span>{t("orgAttendance.out")}: {formatDateTime(record.check_out_at)}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <DecisionResultDialog
        open={attendanceResult !== null}
        onOpenChange={(open) => !open && setAttendanceResult(null)}
        outcome="success"
        title={
          attendanceResult === "checkOut"
            ? t("orgAttendance.checkOutSuccess")
            : t("orgAttendance.checkInSuccess")
        }
        actionLabel={t("common.close")}
      />

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Input type="date" aria-label={t("orgAttendance.fromDate", "From date")} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
        <Input type="date" aria-label={t("orgAttendance.toDate", "To date")} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
        <select aria-label={t("orgAttendance.status", "Status")} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">{t("common.allStatuses", "All statuses")}</option>
          <option value="checked_in">{t("orgAttendance.checkedIn", "Checked In")}</option>
          <option value="checked_out">{t("orgAttendance.checkedOut", "Checked Out")}</option>
        </select>
        {(dateFrom || dateTo || status) && <Button variant="outline" onClick={() => { setDateFrom(""); setDateTo(""); setStatus(""); setPage(1); }}>{t("common.clear", "Clear")}</Button>}
      </div>
      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          <div className="border-b border-border px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <CalendarDays className="h-4 w-4" />
              {t("orgAttendance.history", "Attendance History")}
            </h3>
          </div>
          {history.isLoading ? (
            <TableSkeleton />
          ) : (history.data?.items ?? []).length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {t("orgAttendance.noRecords", "No attendance records yet")}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead>{t("orgAttendance.date", "Date")}</TableHead>
                    <TableHead>{t("orgAttendance.checkIn", "Check In")}</TableHead>
                    <TableHead>{t("orgAttendance.checkOut", "Check Out")}</TableHead>
                    <TableHead>{t("orgAttendance.status", "Status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(history.data?.items ?? []).map((r: AttendanceRecord, i) => (
                    <TableRow key={r.uuid}>
                      <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                        {(page - 1) * 10 + i + 1}
                      </TableCell>
                      <TableCell data-label="Date" className="font-medium">{r.date}</TableCell>
                      <TableCell data-label="Check In" className="text-muted-foreground">
                        {formatDateTime(r.check_in_at)}
                      </TableCell>
                      <TableCell data-label="Check Out" className="text-muted-foreground">
                        {r.check_out_at ? formatDateTime(r.check_out_at) : "—"}
                      </TableCell>
                      <TableCell data-label="Status">
                        <Badge
                          variant="outline"
                          className={
                            r.status === "checked_out"
                              ? "rounded-full border-success/30 bg-success/10 text-success"
                              : "rounded-full border-primary/30 bg-primary/10 text-primary"
                          }
                        >
                          {r.status === "checked_out" ? t("orgAttendance.checkedOut") : t("orgAttendance.checkedIn")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
    </div>
  );
}
