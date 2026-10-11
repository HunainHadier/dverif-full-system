import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/payroll")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Payslips are employee-only server-side, and the sidebar hides this page
    // from staff via the same table.
    if (!canAccessRoute(authStore.get().user, "/payroll")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: PayrollPage,
});

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Wallet } from "lucide-react";
import { salaryService, type SalaryRecord, type SalaryRecordLine } from "@/services";
import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { PageHeader } from "@/components/common/PageHeader";
import { Pagination } from "@/components/common/Pagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { TableSkeleton } from "@/routes/_app.requests";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { ModuleFeatureLockedCard } from "@/components/common/SubscriptionLocked";

const getMonthName = (month: number) => {
  const d = new Date(2026, month - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long" });
};

function money(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * What produced a stored line, in words.
 *
 * `source` is a machine token from the payroll generator. Printing
 * `auto_absenteeism` at a person looking at their own pay is a detail nobody
 * asked for and everyone notices; these say what actually caused the number.
 */
const LINE_SOURCE_LABELS: Record<string, string> = {
  basic: "Salary record",
  component: "Salary component",
  auto_unpaid_leave: "Unpaid leave",
  auto_absenteeism: "Absent days",
  auto_late: "Late arrivals",
  auto_overtime: "Approved overtime",
  auto_expense: "Expense claims",
  manual: "Manual adjustment",
};

const LINE_BASIS_UNITS: Record<string, string> = {
  days: "days",
  hours: "hours",
  late_arrivals: "late arrivals",
  claims: "claims",
};

/** "2 days" from a count and a unit, or null when either is absent. */
function basisLabel(basisValue: SalaryRecordLine["basis_value"], basisUnit: SalaryRecordLine["basis_unit"]) {
  const unit = basisUnit ? LINE_BASIS_UNITS[basisUnit] : null;
  if (!unit || basisValue === null || basisValue === undefined || String(basisValue).trim() === "") return null;
  const count = Number(basisValue);
  if (!Number.isFinite(count)) return null;
  return `${count} ${unit}`;
}

function PayslipDialog({ record, onClose }: { record: SalaryRecord; onClose: () => void }) {
  const { t } = useTranslation();
  const lines = record.lines ?? [];
  const earnings = lines.filter((l) => l.type === "earning");
  const deductions = lines.filter((l) => l.type === "deduction");

  const renderLine = (line: SalaryRecordLine) => {
    const basis = basisLabel(line.basis_value, line.basis_unit);
    const source = line.source ? LINE_SOURCE_LABELS[line.source] ?? line.source : null;
    return (
      <div key={`${line.type}-${line.label}`} className="border-b border-border pb-2">
        <div className="flex justify-between gap-2">
          <span className="text-sm text-foreground">{line.label}</span>
          <span className="whitespace-nowrap text-sm font-medium">{money(line.amount)}</span>
        </div>
        {/*
         * PROVENANCE UNDER THE NAME, not beside it. "Transport allowance" with
         "Salary component" and "15,000" beneath it answers the question the
         three-line summary could not: what is this and where did it come from.
         The basis joins when the line was derived from a count, so "Absent days
         3" reads as three days rather than three units of money.
         */}
        {source || basis ? (
          <span className="text-xs text-muted-foreground">
            {[source, basis].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("orgPayroll.period", "Period")}: {getMonthName(record.month)} {record.year}
          </DialogTitle>
          <DialogDescription>
            {record.employee_name ?? ""} — Payslip
          </DialogDescription>
        </DialogHeader>
        {/*
         * ITEMISED WHEN THE LINES EXIST, aggregated when they do not.
         *
         * A record predating `salary_record_lines` has none, and an empty
         * "Earnings" heading is worse than the total it replaced. Those records
         * keep the four-number view; every record since shows each line.
         */}
        {lines.length ? (
          <div className="space-y-4">
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("orgPayroll.earnings", "Earnings")}
              </h4>
              {earnings.map(renderLine)}
            </section>
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("orgPayroll.deductions", "Deductions")}
              </h4>
              {deductions.length ? deductions.map(renderLine) : (
                <p className="text-sm text-muted-foreground">{t("orgPayroll.noDeductions", "None")}</p>
              )}
            </section>
            <div className="flex justify-between rounded-md bg-primary/10 px-3 py-2">
              <span className="text-sm font-semibold text-foreground">{t("orgPayroll.net", "Net Salary")}</span>
              <span className="text-sm font-bold text-primary">{money(record.net_salary)}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-sm text-muted-foreground">{t("orgPayroll.basic", "Basic")}</span>
              <span className="text-sm font-medium">{money(record.basic_salary)}</span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-sm text-muted-foreground">{t("orgPayroll.allowances", "Allowances")}</span>
              <span className="text-sm font-medium">{money(record.allowances)}</span>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-sm text-muted-foreground">{t("orgPayroll.deductions", "Deductions")}</span>
              <span className="text-sm font-medium">{money(record.deductions)}</span>
            </div>
            <div className="flex justify-between rounded-md bg-primary/10 px-3 py-2">
              <span className="text-sm font-semibold text-foreground">{t("orgPayroll.net", "Net Salary")}</span>
              <span className="text-sm font-bold text-primary">{money(record.net_salary)}</span>
            </div>
          </div>
        )}
        <p className="pt-1 text-xs text-muted-foreground">
          For queries about your payslip, please contact your organization admin.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function PayrollPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState("");
  const [selected, setSelected] = useState<SalaryRecord | null>(null);

  const { isModuleFlagOff } = useOrgSubscription();

  const records = useQuery({
    queryKey: ["my-salary-records", page, period],
    queryFn: () => {
      const [year, month] = period ? period.split("-") : ["", ""];
      return salaryService.mine({ page, limit: 10, year: year || undefined, month: month || undefined });
    },
  });

  const items = useMemo(() => records.data?.items ?? [], [records.data]);

  const moduleLocked = isModuleFlagOff("payroll_management");
  if (moduleLocked) return <ModuleFeatureLockedCard feature="payroll_management" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.payroll", "Payroll")}
        description={t("orgPayroll.description", "View your salary records")}
      />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input type="month" aria-label={t("orgPayroll.filterPeriod", "Filter by period")} value={period} onChange={(e) => { setPeriod(e.target.value); setPage(1); }} className="w-full sm:w-56" />
        {period && <Button variant="outline" onClick={() => { setPeriod(""); setPage(1); }}>{t("common.clear", "Clear")}</Button>}
      </div>
      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          {records.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {t("orgPayroll.noRecords", "No salary records found")}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead>{t("orgPayroll.period", "Period")}</TableHead>
                    <TableHead>{t("orgPayroll.basic", "Basic")}</TableHead>
                    <TableHead>{t("orgPayroll.allowances", "Allowances")}</TableHead>
                    <TableHead>{t("orgPayroll.deductions", "Deductions")}</TableHead>
                    <TableHead>{t("orgPayroll.net", "Net Salary")}</TableHead>
                    <TableHead className="text-right">
                      {t("orgPayroll.payslip", "Payslip")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r, i) => (
                    <TableRow key={r.uuid}>
                      <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                        {(page - 1) * 10 + i + 1}
                      </TableCell>
                      <TableCell data-label="Period" className="font-medium">
                        {getMonthName(r.month)} {r.year}
                      </TableCell>
                      <TableCell data-label="Basic" className="text-muted-foreground">
                        {money(r.basic_salary)}
                      </TableCell>
                      <TableCell data-label="Allowances" className="text-muted-foreground">
                        {money(r.allowances)}
                      </TableCell>
                      <TableCell data-label="Deductions" className="text-muted-foreground">
                        {money(r.deductions)}
                      </TableCell>
                      <TableCell data-label="Net Salary" className="font-medium text-foreground">
                        {money(r.net_salary)}
                      </TableCell>
                      <TableCell data-label="Payslip" className="text-right">
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(r)}>
                          <Wallet className="mr-1.5 h-3.5 w-3.5" /> {t("orgPayroll.payslip", "Payslip")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

      {selected && <PayslipDialog record={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}