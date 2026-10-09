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
import { salaryService, type SalaryRecord } from "@/services";
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

function PayslipDialog({ record, onClose }: { record: SalaryRecord; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("orgPayroll.period", "Period")}: {getMonthName(record.month)} {record.year}
          </DialogTitle>
          <DialogDescription>
            {record.employee_name ?? ""} — Payslip on-screen
          </DialogDescription>
        </DialogHeader>
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
          <p className="pt-1 text-xs text-muted-foreground">
            For queries about your payslip, please contact your organization admin.
          </p>
        </div>
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