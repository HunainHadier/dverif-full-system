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
  const reimbursement = Number(record.expense_reimbursement ?? 0) || 0;
  const totalEarnings =
    (Number(record.basic_salary) || 0) +
    (Number(record.allowances) || 0) +
    reimbursement;
  const hasExpenseLine = earnings.some((line) => line.source === "auto_expense");

  const renderLine = (line: SalaryRecordLine) => {
    const basis = basisLabel(line.basis_value, line.basis_unit);
    const source = line.source ? LINE_SOURCE_LABELS[line.source] ?? line.source : null;
    return (
      <div key={`${line.type}-${line.label}`} className="flex min-w-0 items-start justify-between gap-3 py-2.5">
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-foreground">{line.label}</p>
          {source || basis ? (
            <p className="mt-0.5 break-words text-xs text-muted-foreground">
              {[source, basis].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums">
          {money(line.amount)}
        </span>
      </div>
    );
  };

  const renderSimpleRow = (label: string, amount: string | number, key: string) => (
    <div key={key} className="flex min-w-0 items-start justify-between gap-3 py-2.5">
      <span className="min-w-0 break-words text-sm text-foreground">{label}</span>
      <span className="shrink-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums">
        {money(amount)}
      </span>
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] overflow-x-hidden overflow-y-auto overscroll-contain p-4 sm:max-w-2xl sm:p-6">
        <DialogHeader className="min-w-0 pr-8">
          <DialogTitle className="break-words leading-snug">
            {t("orgPayroll.period", "Period")}: {getMonthName(record.month)} {record.year}
          </DialogTitle>
          <DialogDescription className="break-words">
            {record.employee_name ?? ""} — Payslip
          </DialogDescription>
        </DialogHeader>

        <section className="rounded-xl bg-primary p-4 text-primary-foreground sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] opacity-80">
            {t("orgPayroll.netPayable", "Net salary payable")}
          </p>
          <p className="mt-2 break-words text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
            Rs. {money(record.net_salary)}
          </p>
          <p className="mt-1 text-xs opacity-80">
            {t("orgPayroll.netFormula", "Earnings and approved reimbursements minus deductions")}
          </p>
        </section>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: t("orgPayroll.basic", "Basic"), value: money(record.basic_salary) },
            { label: t("orgPayroll.allowances", "Allowances"), value: money(record.allowances) },
            { label: t("orgPayroll.expenseReimbursement", "Expense reimbursement"), value: money(reimbursement) },
            { label: t("orgPayroll.deductions", "Deductions"), value: money(record.deductions) },
          ].map((item) => (
            <div key={item.label} className="min-w-0 rounded-lg border bg-card p-3">
              <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
              <p className="mt-1 break-words text-sm font-semibold tabular-nums">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("orgPayroll.earnings", "Earnings")}
              </h4>
              <span className="text-xs font-semibold tabular-nums">{money(totalEarnings)}</span>
            </div>
            <div className="divide-y divide-border">
              {lines.length ? (
                <>
                  {earnings.map(renderLine)}
                  {!hasExpenseLine && reimbursement > 0
                    ? renderSimpleRow(t("orgPayroll.expenseReimbursement", "Expense reimbursement"), reimbursement, "expense-reimbursement")
                    : null}
                  {!earnings.length && reimbursement <= 0
                    ? <p className="py-2 text-sm text-muted-foreground">—</p>
                    : null}
                </>
              ) : (
                <>
                  {renderSimpleRow(t("orgPayroll.basic", "Basic"), record.basic_salary, "basic")}
                  {renderSimpleRow(t("orgPayroll.allowances", "Allowances"), record.allowances, "allowances")}
                  {reimbursement > 0
                    ? renderSimpleRow(t("orgPayroll.expenseReimbursement", "Expense reimbursement"), reimbursement, "expense-reimbursement")
                    : null}
                </>
              )}
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t border-border pt-3 text-sm font-semibold">
              <span>{t("orgPayroll.totalEarnings", "Total earnings")}</span>
              <span className="whitespace-nowrap tabular-nums">{money(totalEarnings)}</span>
            </div>
          </section>

          <section className="min-w-0 rounded-xl border bg-card p-3 sm:p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("orgPayroll.deductions", "Deductions")}
              </h4>
              <span className="text-xs font-semibold tabular-nums">{money(record.deductions)}</span>
            </div>
            <div className="divide-y divide-border">
              {lines.length ? (
                deductions.length ? deductions.map(renderLine) : (
                  <p className="py-2 text-sm text-muted-foreground">{t("orgPayroll.noDeductions", "None")}</p>
                )
              ) : (
                renderSimpleRow(t("orgPayroll.deductions", "Deductions"), record.deductions, "deductions")
              )}
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t border-border pt-3 text-sm font-semibold">
              <span>{t("orgPayroll.totalDeductions", "Total deductions")}</span>
              <span className="whitespace-nowrap tabular-nums">{money(record.deductions)}</span>
            </div>
          </section>
        </div>

        <p className="text-xs text-muted-foreground">
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
                    <TableHead>{t("orgPayroll.expenseReimbursement", "Expense reimbursement")}</TableHead>
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
                      <TableCell data-label="Expense reimbursement" className="text-muted-foreground">
                        {money(r.expense_reimbursement ?? 0)}
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