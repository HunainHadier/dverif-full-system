import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

export type SalaryFormEmployee = {
  uuid: string;
  full_name: string;
  designation?: string | null;
  organization_uuid?: string | null;
  organization_name?: string | null;
};

export type SalaryFormValues = {
  employee_uuid: string;
  month: number;
  year: number;
  basic_salary: number;
  allowances: number;
  deductions: number;
  notes?: string;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function money(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Manual-entry salary ledger form. Net salary is displayed as a preview
 * (basic + allowances − deductions); no statutory calculation is performed.
 */
export function SalaryFormDialog({
  open,
  onClose,
  employees,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  employees: SalaryFormEmployee[];
  submitting: boolean;
  onSubmit: (values: SalaryFormValues) => void;
}) {
  const now = new Date();
  const [employeeUuid, setEmployeeUuid] = useState("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [basic, setBasic] = useState("");
  const [allowances, setAllowances] = useState("");
  const [deductions, setDeductions] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setEmployeeUuid("");
      setBasic("");
      setAllowances("");
      setDeductions("");
      setNotes("");
    }
  }, [open]);

  const basicN = Number(basic) || 0;
  const allowN = Number(allowances) || 0;
  const deductN = Number(deductions) || 0;
  const net = basicN + allowN - deductN;

  const years: number[] = [];
  for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) years.push(y);

  const submit = () => {
    if (!employeeUuid) return;
    if (net < 0) return;
    onSubmit({
      employee_uuid: employeeUuid,
      month,
      year,
      basic_salary: basicN,
      allowances: allowN,
      deductions: deductN,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Salary Record</DialogTitle>
          <DialogDescription>
            Manually enter this employee's pay for the period. Deductions are whatever amount you
            have already calculated externally — this is a record-keeping ledger, not automated tax
            compliance.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select value={employeeUuid} onValueChange={setEmployeeUuid}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.uuid} value={e.uuid}>
                    {e.full_name}
                    {e.designation ? ` — ${e.designation}` : ""}
                    {e.organization_name ? ` (${e.organization_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Month</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
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
              <Label>Year</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
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

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Basic salary</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={basic}
                onChange={(e) => setBasic(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Allowances</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={allowances}
                onChange={(e) => setAllowances(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Deductions</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={deductions}
                onChange={(e) => setDeductions(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calculator className="h-4 w-4" /> Net salary
            </span>
            <span
              className={`text-sm font-semibold ${net < 0 ? "text-destructive" : "text-foreground"}`}
            >
              Rs. {money(net)}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. full month, no overtime"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!employeeUuid || net < 0 || submitting}>
            {submitting ? "Saving…" : "Save record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
