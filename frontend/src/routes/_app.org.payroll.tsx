import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Lock, Plus, Trash2, Wallet, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { authStore, useAuth } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { parseFeatureAccess } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { AccessDenied } from "@/components/common/RequireOrgFeature";
import { ModuleFeatureLockedCard } from "@/components/common/SubscriptionLocked";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { TableSkeleton } from "./_app.requests";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  orgSalaryService,
  orgService,
  type PayrollPreview,
  type SalaryRecord,
  type EmployeeRecord,
  type PayrollPolicy,
} from "@/services";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_app/org/payroll")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Deliberately the same call the sidebar makes when deciding whether to
    // render this page's link -- one table, so a visible link and a reachable
    // page cannot disagree. See lib/routeAccess.
    if (!canAccessRoute(authStore.get().user, "/org/payroll")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "Payroll — Dverif" }] }),
  component: OrgPayrollPage,
});

const PAGE_SIZE = 10;

function money(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { message?: string } } };
  return err?.response?.data?.message ?? fallback;
}

function OrgPayrollPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isLocked, isModuleFlagOff } = useOrgSubscription();

  const [tab, setTab] = useState<"employees" | "records" | "settings">("employees");
  const payrollPolicy = useQuery({ queryKey: ["orgPayrollPolicy"], queryFn: () => orgSalaryService.policy() });

  // Records (history) filters
  const [page, setPage] = useState(1);
  const [recSearch, setRecSearch] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  // Employee selection
  const [empSearch, setEmpSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Period modal
  const [periodOpen, setPeriodOpen] = useState(false);
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(new Date().getFullYear());

  const [downloading, setDownloading] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SalaryRecord | null>(null);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const canDelete = user?.org_role === "org_admin";

  const MONTHS = Array.from({ length: 12 }, (_, i) =>
    new Date(2026, i, 1).toLocaleDateString(undefined, { month: "long" }),
  );

  const records = useQuery({
    queryKey: ["orgSalaryRecords", page, recSearch, month, year],
    queryFn: () =>
      orgSalaryService.list({
        page,
        limit: PAGE_SIZE,
        search: recSearch || undefined,
        month: month ? Number(month) : undefined,
        year: year ? Number(year) : undefined,
      }),
  });

  // All org employees for the selection table.
  const employeesQ = useQuery({
    queryKey: ["orgEmployeesForPayroll"],
    queryFn: () => orgService.employees({ page: 1, limit: 1000 }),
  });

  const allEmployees = employeesQ.data?.items ?? [];
  const filteredEmployees = empSearch.trim()
    ? allEmployees.filter((e) => {
        const q = empSearch.trim().toLowerCase();
        return (
          e.full_name.toLowerCase().includes(q) ||
          (e.designation && e.designation.toLowerCase().includes(q)) ||
          (e.email && e.email.toLowerCase().includes(q)) ||
          (e.department && e.department.toLowerCase().includes(q))
        );
      })
    : allEmployees;

  // Prune selections that no longer exist (e.g. employee deleted).
  const validSelected = new Set(
    [...selected].filter((id) => allEmployees.some((e) => e.uuid === id)),
  );
  const allVisibleSelected =
    filteredEmployees.length > 0 && filteredEmployees.every((e) => validSelected.has(e.uuid));

  // ---- Upfront existence check for the chosen period ----
  const periodExistingQ = useQuery({
    queryKey: ["orgSalaryExisting", genMonth, genYear],
    queryFn: () => orgSalaryService.list({ page: 1, limit: 1000, month: genMonth, year: genYear }),
    enabled: periodOpen,
    retry: false,
  });
  const existingPeriodUuids = new Set(
    (periodExistingQ.data?.items ?? []).map((r) => r.employee_uuid),
  );
  const alreadyGeneratedSelected = [...validSelected].filter((id) => existingPeriodUuids.has(id));
  const selectedHasExisting = alreadyGeneratedSelected.length > 0;

  const toggleEmployee = (uuid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredEmployees.forEach((e) => next.delete(e.uuid));
      } else {
        filteredEmployees.forEach((e) => next.add(e.uuid));
      }
      return next;
    });
  };

  const generate = useMutation<
    {
      items: SalaryRecord[];
      month: number;
      year: number;
      count: number;
      skipped?: number;
      message?: string;
    },
    Error,
    { uuids: string[]; month: number; year: number }
  >({
    mutationFn: ({ uuids, month, year }) =>
      orgSalaryService.generate({
        month,
        year,
        employee_uuids: uuids.length ? uuids : undefined,
      }),
    onSuccess: (res) => {
      toast.success(
        res.skipped && res.skipped > 0
          ? t("payroll.generatedSkipped", { count: res.count, skipped: res.skipped })
          : t("payroll.generated", { count: res.count }),
      );
      qc.invalidateQueries({ queryKey: ["orgSalaryRecords"] });
      setPeriodOpen(false);
      setSelected(new Set());
      setTab("records");
    },
    onError: (e: unknown) => {
      const err = e as { response?: { status?: number } };
      if (err?.response?.status === 409) {
        toast.error(
          t("payroll.alreadyGenerated", {
            period: `${MONTHS[genMonth - 1]} ${genYear}`,
          }),
        );
      } else {
        toast.error(apiErrorMessage(e, t("payroll.generationFailed")));
      }
    },
  });

  /**
   * Preview: the same computation the generate path runs, written nowhere.
   *
   * Automatic deductions are the part of a payslip people contest, so the number
   * has to be inspectable BEFORE it is committed. This is not a second
   * implementation - the backend runs one function for both - so the figure
   * previewed and the figure committed cannot drift apart, which is the failure
   * mode of every hand-written "dry run".
   */
  const preview = useMutation<
    PayrollPreview,
    Error,
    { uuids: string[]; month: number; year: number }
  >({
    mutationFn: ({ uuids, month, year }) =>
      orgSalaryService.preview({
        month,
        year,
        employee_uuids: uuids.length ? uuids : undefined,
      }),
    onSuccess: () => setPreviewOpen(true),
  });
  const previewMatchesCurrent = preview.isSuccess
    && preview.variables?.month === genMonth
    && preview.variables?.year === genYear
    && JSON.stringify([...(preview.variables?.uuids ?? [])].sort()) === JSON.stringify([...validSelected].sort());

  const regenerate = useMutation<
    {
      items: SalaryRecord[];
      month: number;
      year: number;
      count: number;
    },
    Error,
    { uuids: string[]; month: number; year: number }
  >({
    mutationFn: ({ uuids, month, year }) =>
      orgSalaryService.generate({
        month,
        year,
        employee_uuids: uuids,
        regenerate: true,
      }),
    onSuccess: (res) => {
      toast.success(t("payroll.regenerated", { count: res.count }));
      qc.invalidateQueries({ queryKey: ["orgSalaryRecords"] });
      setRegenerateOpen(false);
      setPeriodOpen(false);
      setSelected(new Set());
      setTab("records");
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("payroll.regenerateFailed"))),
  });

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await orgSalaryService.exportCsv({
        search: recSearch || undefined,
        month: month ? Number(month) : undefined,
        year: year ? Number(year) : undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Dverif-payroll.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error(apiErrorMessage(e, t("payroll.exportFailed")));
    } finally {
      setExporting(false);
    }
  };

  const downloadPayslip = async (record: SalaryRecord) => {
    setDownloading(record.uuid);
    try {
      const blob = await orgSalaryService.payslip(record.uuid);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Dverif-payslip-${record.uuid.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error(apiErrorMessage(e, "Payslip download failed"));
    } finally {
      setDownloading(null);
    }
  };

  const deleteRecord = useMutation({
    mutationFn: (uuid: string) => orgSalaryService.deleteRecord(uuid),
    onSuccess: () => {
      toast.success(t("payroll.periodDeleted"));
      qc.invalidateQueries({ queryKey: ["orgSalaryRecords"] });
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("payroll.deleteFailed"))),
  });

  const items = records.data?.items ?? [];
  const years: number[] = [];
  const nowYear = new Date().getFullYear();
  for (let y = nowYear - 1; y <= nowYear + 1; y++) years.push(y);

  const perms = usePermissions();
  if (!perms.isOrgAdmin && !perms.payroll) return <AccessDenied feature="payroll" />;

  const moduleLocked = isModuleFlagOff("payroll_management");
  if (moduleLocked) return <ModuleFeatureLockedCard feature="payroll_management" />;

  return (
    <div>
      <PageHeader
        title={t("nav.payroll")}
        description={t("payroll.description")}
        actions={
          tab === "records" ? (
            <div className="flex shrink-0 flex-nowrap gap-2 whitespace-nowrap">
              <Button
                className="w-40 shrink-0 justify-center"
                variant="outline"
                onClick={exportCsv}
                disabled={isLocked || exporting || items.length === 0}
              >
                {isLocked ? (
                  <Lock className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                {isLocked
                  ? "Subscription Required"
                  : exporting
                    ? t("payroll.exporting")
                    : t("payroll.exportCsv")}
              </Button>
            </div>
          ) : (
            <div className="flex shrink-0 flex-nowrap items-center gap-2 whitespace-nowrap">
              <span className="text-sm text-muted-foreground">
                {t("payroll.selectedCount", { count: validSelected.size })}
              </span>
              <Button
                className="shrink-0 justify-center"
                disabled={isLocked || validSelected.size === 0 || !payrollPolicy.data?.configured}
                onClick={() => setPeriodOpen(true)}
              >
                {isLocked ? (
                  <Lock className="mr-1.5 h-4 w-4" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" />
                )}
                {isLocked ? "Subscription Required" : t("payroll.generatePayroll")}
              </Button>
            </div>
          )
        }
      />

      {!payrollPolicy.isLoading && !payrollPolicy.data?.configured ? <div className="mt-3 flex flex-col gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span>Payroll is blocked until your organization confirms working days, currency, pay frequency and deduction rules.</span><Button size="sm" variant="outline" onClick={() => setTab("settings")}>Configure payroll policy</Button></div> : null}

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "employees" | "records" | "settings")}
        className="mt-2"
      >
        <TabsList>
          <TabsTrigger value="employees">
            <Users className="mr-1.5 h-4 w-4" />
            {t("payroll.employeesTab", "Employees")}
          </TabsTrigger>
          <TabsTrigger value="records">
            <FileText className="mr-1.5 h-4 w-4" />
            {t("payroll.recordsTab", "Payroll Records")}
          </TabsTrigger>
          <TabsTrigger value="settings" disabled={!perms.isOrgAdmin}>Payroll Policy</TabsTrigger>
        </TabsList>

        {/* ---------------- Employee selection table ---------------- */}
        <TabsContent value="employees">
          <Card className="border-border/70 shadow-none">
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
                <SearchInput
                  value={empSearch}
                  onChange={setEmpSearch}
                  placeholder={t("payroll.searchEmployee")}
                />
                <span className="text-xs text-muted-foreground">
                  {filteredEmployees.length} / {allEmployees.length}{" "}
                  {t("payroll.employeeCountSuffix", "employees")}
                </span>
              </div>

              {employeesQ.isLoading ? (
                <TableSkeleton />
              ) : filteredEmployees.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Users}
                    title={t("payroll.noEmployeesFound")}
                    description={t("payroll.noEmployeeDesc", "No employees have been added yet.")}
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allVisibleSelected}
                            onCheckedChange={toggleAllVisible}
                            aria-label={t("payroll.selectAll")}
                          />
                        </TableHead>
                        <TableHead className="whitespace-nowrap">{t("payroll.employee")}</TableHead>
                        <TableHead className="whitespace-nowrap hidden sm:table-cell">
                          {t("payroll.designationCol", "Designation")}
                        </TableHead>
                        <TableHead className="whitespace-nowrap hidden md:table-cell">
                          {t("payroll.departmentCol", "Department")}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEmployees.map((emp: EmployeeRecord) => (
                        <TableRow key={emp.uuid}>
                          <TableCell className="w-10">
                            <Checkbox
                              checked={validSelected.has(emp.uuid)}
                              onCheckedChange={() => toggleEmployee(emp.uuid)}
                              aria-label={emp.full_name}
                            />
                          </TableCell>
                          <TableCell data-label="Employee" className="whitespace-nowrap">
                            <div className="text-sm font-medium text-foreground">
                              {emp.full_name}
                            </div>
                            {emp.email ? (
                              <div className="text-xs text-muted-foreground">{emp.email}</div>
                            ) : null}
                          </TableCell>
                          <TableCell
                            data-label="Designation"
                            className="whitespace-nowrap text-sm text-muted-foreground hidden sm:table-cell"
                          >
                            {emp.designation ?? "—"}
                          </TableCell>
                          <TableCell
                            data-label="Department"
                            className="whitespace-nowrap text-sm text-muted-foreground hidden md:table-cell"
                          >
                            {emp.department ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Payroll records (history) table ---------------- */}
        <TabsContent value="records">
          <Card className="border-border/70 shadow-none">
            <CardContent className="p-0">
              <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
                <SearchInput
                  value={recSearch}
                  onChange={(v) => {
                    setRecSearch(v);
                    setPage(1);
                  }}
                  placeholder={t("payroll.searchEmployee")}
                />
                <Select
                  value={month}
                  onValueChange={(v) => {
                    setMonth(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-40">
                    <SelectValue placeholder={t("payroll.allMonths")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("payroll.allMonths")}</SelectItem>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={String(i + 1)} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={year}
                  onValueChange={(v) => {
                    setYear(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full lg:w-32">
                    <SelectValue placeholder={t("payroll.allYears")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t("payroll.allYears")}</SelectItem>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {records.isLoading ? (
                <TableSkeleton />
              ) : items.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    icon={Wallet}
                    title={t("payroll.noPayrollYet")}
                    description={t("payroll.noPayrollDesc")}
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
                            {t("payroll.employee")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">{t("payroll.period")}</TableHead>
                          <TableHead className="whitespace-nowrap text-right">
                            {t("payroll.basic")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-right">
                            {t("payroll.allowances")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-right">
                            {t("payroll.deductions")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-right">
                            {t("payroll.net")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-right">
                            {t("payroll.payslip")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-right">—</TableHead>
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
                            <TableCell
                              data-label="Period"
                              className="whitespace-nowrap text-sm text-muted-foreground"
                            >
                              {MONTHS[Number(r.month) - 1]} {r.year}
                            </TableCell>
                            <TableCell
                              data-label="Basic"
                              className="whitespace-nowrap text-right text-sm text-muted-foreground"
                            >
                              {money(r.basic_salary)}
                            </TableCell>
                            <TableCell
                              data-label="Allowances"
                              className="whitespace-nowrap text-right text-sm text-muted-foreground"
                            >
                              {money(r.allowances)}
                            </TableCell>
                            <TableCell
                              data-label="Deductions"
                              className="whitespace-nowrap text-right text-sm text-muted-foreground"
                            >
                              {money(r.deductions)}
                            </TableCell>
                            <TableCell
                              data-label="Net"
                              className="whitespace-nowrap text-right text-sm font-semibold text-foreground"
                            >
                              {money(r.net_salary)}
                            </TableCell>
                            <TableCell
                              data-label="Payslip"
                              className="whitespace-nowrap text-right"
                            >
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => downloadPayslip(r)}
                                disabled={downloading === r.uuid}
                              >
                                <FileText className="mr-1 h-3.5 w-3.5" />
                                {downloading === r.uuid ? "…" : t("payroll.payslip")}
                              </Button>
                            </TableCell>
                            <TableCell data-label="—" className="whitespace-nowrap text-right">
                              {canDelete ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-muted-foreground hover:text-destructive"
                                  disabled={isLocked}
                                  onClick={() => setDeleteTarget(r)}
                                >
                                  {isLocked ? (
                                    <Lock className="h-3.5 w-3.5" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              ) : null}
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
        </TabsContent>
        <TabsContent value="settings"><PayrollPolicySettings /></TabsContent>
      </Tabs>

      {/* ---------- Period-only modal (Year + Month) ---------- */}
      <Dialog
        open={periodOpen}
        onOpenChange={(o) => {
          if (!o) setPeriodOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("payroll.generateTitle")}</DialogTitle>
            <DialogDescription>
              {t("payroll.generateSelectionDesc", {
                count: validSelected.size,
                defaultValue:
                  "Choose the month and year. Payroll will be generated for {{count}} selected employee(s).",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("payroll.payrollMonth", "Month")}</label>
              <Select value={String(genMonth)} onValueChange={(v) => setGenMonth(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("payroll.payrollYear", "Year")}</label>
              <Select value={String(genYear)} onValueChange={(v) => setGenYear(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedHasExisting ? (
            <div className="mt-1 flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              <span className="font-medium">
                {t("payroll.alreadyGeneratedNote", {
                  count: alreadyGeneratedSelected.length,
                  period: `${MONTHS[genMonth - 1]} ${genYear}`,
                })}
              </span>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setPeriodOpen(false)}
              disabled={generate.isPending || regenerate.isPending || preview.isPending}
            >
              {t("actions.cancel", "Cancel")}
            </Button>
            {/* Preview sits between Cancel and Generate on purpose: the numbers are
                the thing being agreed, so seeing them must not require committing
                to them. */}
            <Button
              variant="outline"
              onClick={() =>
                preview.mutate({ uuids: [...validSelected], month: genMonth, year: genYear })
              }
              disabled={generate.isPending || regenerate.isPending || preview.isPending}
              loading={preview.isPending}
            >
              {t("payroll.preview", { defaultValue: "Preview" })}
            </Button>
            {selectedHasExisting ? (
              <Button
                variant="destructive"
                onClick={() => setRegenerateOpen(true)}
                disabled={generate.isPending || regenerate.isPending || !previewMatchesCurrent}
                loading={regenerate.isPending}
              >
                {t("payroll.regenerateSelected", { count: alreadyGeneratedSelected.length })}
              </Button>
            ) : (
              <Button
                onClick={() =>
                  generate.mutate({ uuids: [...validSelected], month: genMonth, year: genYear })
                }
                disabled={generate.isPending || regenerate.isPending || !previewMatchesCurrent}
                loading={generate.isPending}
              >
                {t("payroll.generatePayroll")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Payroll preview: what will be computed, and why ---------- */}
      <Dialog
        open={previewOpen && preview.isSuccess && periodOpen}
        onOpenChange={(o) => {
          setPreviewOpen(o);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("payroll.previewTitle", { defaultValue: "Payroll preview" })}
            </DialogTitle>
            <DialogDescription>
              {t("payroll.previewDesc", {
                period: `${MONTHS[genMonth - 1]} ${genYear}`,
                count: preview.data?.count ?? 0,
                defaultValue:
                  "For {{period}}, {{count}} employee(s). Nothing is saved — generating payroll afterwards will store exactly these figures.",
              })}
            </DialogDescription>
          </DialogHeader>

          {preview.isError ? (
            <p className="text-sm text-destructive">
              {apiErrorMessage(preview.error, t("payroll.previewFailed", "Preview failed"))}
            </p>
          ) : null}

          <div className="space-y-3">
            {(preview.data?.items ?? []).map((item) => {
              const a = item.attendance;
              const auto = item.lines.filter((l) => l.source !== "component");
              return (
                <div key={item.employee_uuid} className="rounded-md border p-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{item.employee_name}</span>
                    <span className="font-mono text-sm font-semibold">
                      {item.rates.currency} {money(item.net_salary)}
                    </span>
                  </div>

                  {/* The four figures the deduction is actually made of. Shown as
                      counts rather than only as money, because "2 unpaid leave
                      days" is an explanation and "2818.18" is not. */}
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-muted-foreground">
                        {t("payroll.previewAttended", "Attended")}
                      </span>
                      <p className="font-medium">
                        {a.attended_days} / {a.working_days}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("payroll.previewUnpaidLeave", "Unpaid leave")}
                      </span>
                      <p className="font-medium">
                        {a.unpaid_leave_days}
                        {a.paid_leave_days > 0 ? (
                          <span className="ml-1 font-normal text-muted-foreground">
                            (+{a.paid_leave_days} paid)
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("payroll.previewLate", "Late arrivals")}
                      </span>
                      <p className="font-medium">{a.late_count}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("payroll.previewOvertime", "Overtime (hrs)")}
                      </span>
                      <p className="font-medium">{a.approved_overtime_hours}</p>
                    </div>
                  </div>

                  {item.rates.skip_reason ? (
                    // Stated rather than left blank: an employee with no automatic
                    // lines and an employee whose lines could not be computed look
                    // identical otherwise, and only one of them is a problem.
                    <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
                      {item.rates.skip_reason === "no_basic_salary"
                        ? t(
                            "payroll.previewNoSalary",
                            "No basic salary on record for this month, so attendance and leave cannot be converted to money.",
                          )
                        : t(
                            "payroll.previewNoWorkingDays",
                            "This month has no working days, so there is no daily rate to deduct against.",
                          )}
                    </p>
                  ) : null}

                  {auto.length > 0 ? (
                    <ul className="mt-2 space-y-1 border-t pt-2 text-xs">
                      {auto.map((line) => (
                        <li
                          key={`${line.source}-${line.label}`}
                          className="flex justify-between gap-3"
                        >
                          <span className="text-muted-foreground">
                            {line.label}
                            {line.source === "auto_overtime" ? "" : ""}
                          </span>
                          <span
                            className={
                              line.type === "earning"
                                ? "font-mono font-medium text-emerald-600 dark:text-emerald-400"
                                : "font-mono font-medium"
                            }
                          >
                            {line.type === "earning" ? "+" : "−"}
                            {item.rates.currency} {money(line.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("payroll.previewRates", {
                      perDay: `${item.rates.currency} ${money(item.rates.per_day)}`,
                      hourly: `${item.rates.currency} ${money(item.rates.hourly)}`,
                      divisor: item.rates.divisor,
                      basis: item.rates.daily_rate_basis,
                      defaultValue: "Daily rate {{perDay}} (basic salary ÷ {{divisor}} {{basis}}) · hourly rate {{hourly}}",
                    })}
                    {a.holidays_in_month > 0
                      ? ` · ${t("payroll.previewHolidays", {
                          count: a.holidays_in_month,
                          defaultValue: "{{count}} holiday(s) excluded from working days",
                        })}`
                      : ""}
                  </p>
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              {t("actions.close", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={regenerateOpen}
        onOpenChange={(o) => !o && setRegenerateOpen(false)}
        title={t("payroll.regenerateTitle", {
          defaultValue: "Regenerate payroll for this period?",
        })}
        description={t("payroll.regenerateConfirm", {
          count: alreadyGeneratedSelected.length,
          period: `${MONTHS[genMonth - 1]} ${genYear}`,
          defaultValue:
            "This will overwrite the existing payroll for {{count}} selected employee(s) for {{period}}. Existing records will be deleted and recomputed. This cannot be undone.",
        })}
        confirmLabel={t("payroll.regenerate", { defaultValue: "Regenerate" })}
        onConfirm={() =>
          regenerate.mutate({ uuids: alreadyGeneratedSelected, month: genMonth, year: genYear })
        }
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("payroll.deleteRecordTitle", { defaultValue: "Delete this payroll record?" })}
        description={t("payroll.deleteRecordConfirm", {
          defaultValue: "Only this employee payroll record will be deleted.",
        })}
        onConfirm={() => deleteTarget && deleteRecord.mutate(deleteTarget.uuid)}
      />
    </div>
  );
}


type PolicyFieldForm = {
  currency: string; pay_frequency: string; daily_rate_basis: string; shift_start_time: string; hours_per_workday: string;
  late_grace_minutes: string; late_arrivals_per_penalty: string; late_penalty_days: string;
  overtime_multiplier: string; deduct_unpaid_leave: string; deduct_absences: string;
  deduct_late_arrivals: string; pay_approved_overtime: string;
  work_week: Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", string>;
};
const EMPTY_POLICY_FORM: PolicyFieldForm = {
  currency: "", pay_frequency: "", daily_rate_basis: "", shift_start_time: "", hours_per_workday: "",
  late_grace_minutes: "", late_arrivals_per_penalty: "", late_penalty_days: "",
  overtime_multiplier: "", deduct_unpaid_leave: "", deduct_absences: "",
  deduct_late_arrivals: "", pay_approved_overtime: "",
  work_week: { mon: "", tue: "", wed: "", thu: "", fri: "", sat: "", sun: "" },
};
const PAYROLL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function PayrollPolicySettings() {
  const qc = useQueryClient();
  const policyQ = useQuery({ queryKey: ["orgPayrollPolicy"], queryFn: () => orgSalaryService.policy() });
  const [form, setForm] = useState<PolicyFieldForm>(EMPTY_POLICY_FORM);
  const [validation, setValidation] = useState("");
  useEffect(() => {
    const result = policyQ.data;
    if (!result?.configured || !result.policy || !result.work_week) return;
    const policy = result.policy as PayrollPolicy;
    setForm({
      currency: policy.currency ?? "", pay_frequency: policy.pay_frequency ?? "", daily_rate_basis: policy.daily_rate_basis ?? "",
      shift_start_time: String(policy.shift_start_time ?? "").slice(0, 5),
      hours_per_workday: String(policy.hours_per_workday ?? ""), late_grace_minutes: String(policy.late_grace_minutes ?? ""),
      late_arrivals_per_penalty: String(policy.late_arrivals_per_penalty ?? ""), late_penalty_days: String(policy.late_penalty_days ?? ""),
      overtime_multiplier: String(policy.overtime_multiplier ?? ""),
      deduct_unpaid_leave: policy.deduct_unpaid_leave ? "on" : "off", deduct_absences: policy.deduct_absences ? "on" : "off",
      deduct_late_arrivals: policy.deduct_late_arrivals ? "on" : "off", pay_approved_overtime: policy.pay_approved_overtime ? "on" : "off",
      work_week: Object.fromEntries(PAYROLL_DAYS.map((day) => [day, Number(result.work_week?.[day]) === 1 ? "on" : "off"])) as PolicyFieldForm["work_week"],
    });
  }, [policyQ.data]);
  const save = useMutation({
    mutationFn: (data: PayrollPolicy) => orgSalaryService.savePolicy(data),
    onSuccess: () => { toast.success("Payroll policy saved and confirmed"); qc.invalidateQueries({ queryKey: ["orgPayrollPolicy"] }); setValidation(""); },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not save payroll policy")),
  });
  const setField = (key: keyof Omit<PolicyFieldForm, "work_week">, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const submit = () => {
    const values = [form.currency, form.pay_frequency, form.daily_rate_basis, form.shift_start_time, form.hours_per_workday, form.late_grace_minutes, form.late_arrivals_per_penalty, form.late_penalty_days, form.overtime_multiplier, form.deduct_unpaid_leave, form.deduct_absences, form.deduct_late_arrivals, form.pay_approved_overtime, ...PAYROLL_DAYS.map((day) => form.work_week[day])];
    if (values.some((value) => value === "")) { setValidation("Complete every policy field. Choose on/off for each payroll rule and workday; blank is not treated as company policy."); return; }
    if (!PAYROLL_DAYS.some((day) => form.work_week[day] === "on")) { setValidation("Select at least one working day."); return; }
    save.mutate({
      currency: form.currency.toUpperCase(), pay_frequency: form.pay_frequency as PayrollPolicy["pay_frequency"], daily_rate_basis: form.daily_rate_basis as PayrollPolicy["daily_rate_basis"],
      shift_start_time: form.shift_start_time, hours_per_workday: Number(form.hours_per_workday), late_grace_minutes: Number(form.late_grace_minutes), late_arrivals_per_penalty: Number(form.late_arrivals_per_penalty),
      late_penalty_days: Number(form.late_penalty_days), overtime_multiplier: Number(form.overtime_multiplier),
      deduct_unpaid_leave: form.deduct_unpaid_leave === "on", deduct_absences: form.deduct_absences === "on", deduct_late_arrivals: form.deduct_late_arrivals === "on", pay_approved_overtime: form.pay_approved_overtime === "on",
      work_week: Object.fromEntries(PAYROLL_DAYS.map((day) => [day, form.work_week[day] === "on"])) as PayrollPolicy["work_week"],
    });
  };
  const selectField = (label: string, key: keyof Omit<PolicyFieldForm, "work_week">, options: [string, string][]) => <label className="space-y-1 text-sm"><span className="font-medium">{label}</span><select className="h-9 w-full rounded-md border border-input bg-background px-2" value={form[key]} onChange={(e) => setField(key, e.target.value)}><option value="">Choose?</option>{options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>;
  const numberField = (label: string, key: keyof Omit<PolicyFieldForm, "work_week">, min = "0", step = "1") => <label className="space-y-1 text-sm"><span className="font-medium">{label}</span><Input type="number" min={min} step={step} value={form[key]} onChange={(e) => setField(key, e.target.value)} /></label>;
  const toggleField = (label: string, key: keyof Omit<PolicyFieldForm, "work_week">) => selectField(label, key, [["on", "Enabled"], ["off", "Disabled"]]);
  return <Card className="border-border/70 shadow-none"><CardContent className="space-y-5 p-4">
    <div><h2 className="font-semibold">Organization payroll policy</h2><p className="text-sm text-muted-foreground">No attendance or leave deduction rule is assumed. Payroll preview and finalization stay blocked until an administrator explicitly confirms this policy.</p></div>
    {policyQ.isLoading ? <p className="text-sm">Loading payroll policy?</p> : null}
    {policyQ.data?.configured ? <p className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2 text-sm">Policy confirmed. Changes apply to future payroll previews and runs.</p> : <p className="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-sm">Setup required. Legacy organizations must review the work week and every deduction rule before payroll can be finalized.</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 text-sm"><span className="font-medium">Currency (ISO 4217)</span><Input maxLength={3} value={form.currency} onChange={(e) => setField("currency", e.target.value.toUpperCase())} placeholder="e.g. PKR" /></label>
      {selectField("Pay frequency", "pay_frequency", [["weekly", "Weekly"], ["biweekly", "Biweekly"], ["semi_monthly", "Semi-monthly"], ["monthly", "Monthly"]])}
      {selectField("Daily rate divisor", "daily_rate_basis", [["actual_working_days", "Configured working days in period"], ["calendar_days", "Calendar days in period"], ["fixed_30", "Fixed 30-day divisor"]])}
    </div>
    <fieldset className="space-y-2"><legend className="text-sm font-medium">Working days</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{PAYROLL_DAYS.map((day) => <label key={day} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm"><span>{({mon:"Monday",tue:"Tuesday",wed:"Wednesday",thu:"Thursday",fri:"Friday",sat:"Saturday",sun:"Sunday"})[day]}</span><select aria-label={`${day} working day`} className="h-8 rounded border bg-background px-1" value={form.work_week[day]} onChange={(e) => setForm((old) => ({ ...old, work_week: { ...old.work_week, [day]: e.target.value } }))}><option value="">Choose?</option><option value="on">Work</option><option value="off">Off</option></select></label>)}</div></fieldset>
    <div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1 text-sm"><span className="font-medium">Organization shift start</span><Input type="time" value={form.shift_start_time} onChange={(e) => setField("shift_start_time", e.target.value)} /></label>{numberField("Hours per workday", "hours_per_workday", "0.01", "0.25")}{numberField("Late grace period (minutes)", "late_grace_minutes")}{numberField("Late arrivals per penalty", "late_arrivals_per_penalty", "1")}{numberField("Penalty days per threshold", "late_penalty_days", "0", "0.05")}{numberField("Approved overtime multiplier", "overtime_multiplier", "0", "0.05")}</div>
    <div className="grid gap-3 sm:grid-cols-2">{toggleField("Deduct approved unpaid leave", "deduct_unpaid_leave")}{toggleField("Deduct unexplained absences", "deduct_absences")}{toggleField("Apply late-arrival deduction", "deduct_late_arrivals")}{toggleField("Pay approved overtime", "pay_approved_overtime")}</div>
    {validation ? <p role="alert" className="text-sm text-destructive">{validation}</p> : null}
    <div className="flex justify-end"><Button onClick={submit} disabled={save.isPending || policyQ.isLoading}>Save and confirm payroll policy</Button></div>
  </CardContent></Card>;
}
