import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, FileText, Loader2, Lock, Plus, Trash2, Wallet, Users, CalendarDays, Clock, SlidersHorizontal } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  type PayrollEmployeeRow,
  type PayrollSettings,
  type PayrollRunDay,
} from "@/services";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SalaryComponentsManager } from "@/components/salary/SalaryComponentsManager";

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

function PayrollOvertimeInput({
  value,
  savedValue,
  disabled,
  onChange,
}: {
  value: number | string;
  savedValue: number | string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const parsedValue = value === "" ? 0 : Number(value);
  const isDraft = !Number.isFinite(parsedValue) || parsedValue !== Number(savedValue);

  return (
    <div className="space-y-1">
      <Input
        type="number"
        min="0"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t("payroll.overtimeAmount", "Overtime amount")}
        className="ml-auto w-28 text-right"
      />
    </div>
  );
}

function money(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { message?: string } } };
  return err?.response?.data?.message ?? fallback;
}

function normalizePayrollSettings(settings: PayrollSettings): PayrollSettings {
  return {
    ...settings,
    calculate_overtime: false,
    shift_start_time: String(settings.shift_start_time).slice(0, 5),
    shift_end_time: String(settings.shift_end_time).slice(0, 5),
    overtime_multiplier: Number(settings.overtime_multiplier),
    deduct_salary_for_late_arrivals: settings.deduct_salary_for_late_arrivals ?? false,
    late_arrival_threshold: Number(settings.late_arrival_threshold ?? 1),
    late_grace_minutes: Number(settings.late_grace_minutes ?? 10),
  };
}

/** JSON columns may arrive parsed or as text depending on the MySQL driver. */
function parseSnapshotColumn(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * The policy that was in force when this payroll record was generated.
 *
 * Reading the saved snapshot (instead of today's settings) is what makes the
 * records-table preview show the same figures that were committed, even if the
 * organization has changed its payroll policy since. Returns undefined for
 * records generated before snapshots were stored or for malformed data, in
 * which case the preview falls back to the current policy.
 */
function recordPolicySnapshot(value: unknown): PayrollSettings | undefined {
  const raw = parseSnapshotColumn(value);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const snapshot = raw as Record<string, unknown>;
  const method = snapshot.salary_calculation_method;
  if (method !== "hours" && method !== "days") return undefined;
  if (
    typeof snapshot.calculate_overtime !== "boolean"
    || typeof snapshot.shift_start_time !== "string"
    || typeof snapshot.shift_end_time !== "string"
    || !Number.isFinite(Number(snapshot.overtime_multiplier))
  ) {
    return undefined;
  }
  return {
    salary_calculation_method: method,
    calculate_overtime: snapshot.calculate_overtime,
    shift_start_time: snapshot.shift_start_time.slice(0, 5),
    shift_end_time: snapshot.shift_end_time.slice(0, 5),
    overtime_multiplier: Number(snapshot.overtime_multiplier),
    deduct_salary_for_late_arrivals: snapshot.deduct_salary_for_late_arrivals === true,
    late_arrival_threshold: Number(snapshot.late_arrival_threshold ?? 1) || 1,
    late_grace_minutes: Number(snapshot.late_grace_minutes ?? 0),
  };
}

/** The working/off calendar stored alongside the record, if it covers the whole month. */
function recordScheduleSnapshot(
  value: unknown,
  month: number,
  year: number,
): PayrollRunDay[] | undefined {
  const raw = parseSnapshotColumn(value);
  if (!Array.isArray(raw)) return undefined;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (raw.length !== daysInMonth) return undefined;
  const expectedDates = Array.from(
    { length: daysInMonth },
    (_, index) => `${year}-${String(month).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
  );
  const expected = new Set(expectedDates);
  const byDate = new Map<string, "working" | "off">();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const day = item as { date?: unknown; day_type?: unknown };
    if (
      typeof day.date !== "string"
      || !expected.has(day.date)
      || (day.day_type !== "working" && day.day_type !== "off")
      || byDate.has(day.date)
    ) {
      return undefined;
    }
    byDate.set(day.date, day.day_type);
  }
  return expectedDates.map((date) => ({ date, day_type: byDate.get(date)! }));
}

/**
 * Re-run the exact calculation captured by a stored payroll record.
 *
 * Settings and schedule come from the record's own snapshots so the preview is
 * not affected by later policy/calendar edits. They are only sent together
 * because the backend requires the pair; a record without both falls back to
 * the organization's current inputs.
 */
function recordPreviewInputs(record: SalaryRecord): {
  settings?: PayrollSettings;
  days?: PayrollRunDay[];
} {
  const month = Number(record.month);
  const year = Number(record.year);
  const settings = recordPolicySnapshot(record.payroll_policy_snapshot);
  const days = recordScheduleSnapshot(record.payroll_schedule_snapshot, month, year);
  return settings && days ? { settings, days } : {};
}

function OrgPayrollPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const perms = usePermissions();
  const { isLocked, isModuleFlagOff } = useOrgSubscription();

  const [tab, setTab] = useState<"employees" | "records" | "components" | "policies">("employees");

  // Records (history) filters
  const [page, setPage] = useState(1);
  const [recSearch, setRecSearch] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [recordEmployee, setRecordEmployee] = useState("");
  const [recordDepartment, setRecordDepartment] = useState("");

  // Employee selection
  const [empSearch, setEmpSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [employeeMonth, setEmployeeMonth] = useState(new Date().getMonth() + 1);
  const [employeeYear, setEmployeeYear] = useState(new Date().getFullYear());
  const [employeePeriodPickerOpen, setEmployeePeriodPickerOpen] = useState(false);
  const [overtimeDrafts, setOvertimeDrafts] = useState<Record<string, string>>({});

  // Period modal
  const [periodOpen, setPeriodOpen] = useState(false);
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [generateSettingsForm, setGenerateSettingsForm] = useState<PayrollSettings>({
    salary_calculation_method: "days",
    calculate_overtime: false,
    shift_start_time: "09:00",
    shift_end_time: "17:00",
    overtime_multiplier: 1.5,
    deduct_salary_for_late_arrivals: false,
    late_arrival_threshold: 1,
    late_grace_minutes: 10,
  });
  const [generateSettingsPeriod, setGenerateSettingsPeriod] = useState("");
  const [generateDayTypes, setGenerateDayTypes] = useState<Record<string, "working" | "off">>({});
  const [generateSchedulePeriod, setGenerateSchedulePeriod] = useState("");

  const [downloading, setDownloading] = useState<string | null>(null);
  /** Which record's payslip is being opened for preview, so the row shows a spinner. */
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SalaryRecord | null>(null);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  /**
   * Which calculation the shared preview modal is showing: the unsaved run from
   * the generate dialog, or a re-calculation opened from the records table.
   * Keeping this explicit stops one flow's numbers leaking into the other.
   */
  const [previewSource, setPreviewSource] = useState<"generation" | "record" | null>(null);
  const canDelete = user?.org_role === "org_admin";

  const MONTHS = Array.from({ length: 12 }, (_, i) =>
    new Date(2026, i, 1).toLocaleDateString(undefined, { month: "long" }),
  );

  const departmentsQ = useQuery({ queryKey: ["payrollDepartments"], queryFn: () => orgService.departments.list() });

  const records = useQuery({
    queryKey: ["orgSalaryRecords", page, recSearch, month, year, recordEmployee, recordDepartment],
    queryFn: () =>
      orgSalaryService.list({
        page,
        limit: PAGE_SIZE,
        search: recSearch || undefined,
        month: month ? Number(month) : undefined,
        year: year ? Number(year) : undefined,
        employee_uuid: recordEmployee || undefined,
        department: recordDepartment || undefined,
      }),
  });

  // All org employees for the selection table.
  const employeesQ = useQuery({
    queryKey: ["orgEmployeesForPayroll", employeeMonth, employeeYear],
    queryFn: () => orgSalaryService.employees({
      page: 1,
      limit: 1000,
      month: employeeMonth,
      year: employeeYear,
    }),
  });

  const payrollSettingsQ = useQuery({
    queryKey: ["orgPayrollSettings", genMonth, genYear],
    queryFn: () => orgSalaryService.settings(genMonth, genYear),
    enabled: periodOpen,
    refetchOnMount: "always",
  });
  useEffect(() => {
    if (!payrollSettingsQ.isSuccess) return;
    const settings = payrollSettingsQ.data ?? {
      salary_calculation_method: "days" as const,
      calculate_overtime: false,
      shift_start_time: "09:00",
      shift_end_time: "17:00",
      overtime_multiplier: 1.5,
      deduct_salary_for_late_arrivals: false,
      late_arrival_threshold: 1,
      late_grace_minutes: 10,
    };
    setGenerateSettingsForm(normalizePayrollSettings(settings));
    setGenerateSettingsPeriod(`${genYear}-${genMonth}`);
  }, [payrollSettingsQ.data, payrollSettingsQ.isSuccess, genMonth, genYear]);
  const payrollScheduleQ = useQuery({
    queryKey: ["orgPayrollSchedule", genMonth, genYear],
    queryFn: () => orgSalaryService.schedule(genMonth, genYear),
    enabled: periodOpen,
  });
  useEffect(() => {
    const schedule = payrollScheduleQ.data;
    if (
      !payrollScheduleQ.isSuccess ||
      schedule?.month !== genMonth ||
      schedule?.year !== genYear
    ) return;
    const next: Record<string, "working" | "off"> = {};
    for (let day = 1; day <= new Date(genYear, genMonth, 0).getDate(); day++) {
      const date = `${genYear}-${String(genMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      next[date] = new Date(genYear, genMonth - 1, day).getDay() % 6 === 0 ? "off" : "working";
    }
    for (const item of schedule.days) {
      const date = String(item.schedule_date).slice(0, 10);
      if (Object.prototype.hasOwnProperty.call(next, date)) next[date] = item.day_type;
    }
    setGenerateDayTypes(next);
    setGenerateSchedulePeriod(`${genYear}-${genMonth}`);
  }, [payrollScheduleQ.data, payrollScheduleQ.isSuccess, genMonth, genYear]);

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
  const daysInSelectedMonth = new Date(genYear, genMonth, 0).getDate();
  const firstWeekdayInSelectedMonth = new Date(genYear, genMonth - 1, 1).getDay();
  const selectedScheduleData =
    payrollScheduleQ.data?.month === genMonth && payrollScheduleQ.data.year === genYear
      ? payrollScheduleQ.data
      : undefined;
  const selectedMonthSchedule = new Map(
    (selectedScheduleData?.days ?? []).map((day) => [
      String(day.schedule_date).slice(0, 10),
      day.day_type,
    ]),
  );
  const generateScheduleKey = `${genYear}-${genMonth}`;
  const generateScheduleReady = generateSchedulePeriod === generateScheduleKey;
  const selectedMonthScheduleDates = Array.from({ length: daysInSelectedMonth }, (_, index) =>
    `${genYear}-${String(genMonth).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`,
  );
  const savedScheduleDayTypes = selectedMonthScheduleDates.map((date, index) =>
    selectedMonthSchedule.get(date) ??
    (new Date(genYear, genMonth - 1, index + 1).getDay() % 6 === 0 ? "off" : "working"),
  );
  const selectedMonthDayTypes = Array.from({ length: daysInSelectedMonth }, (_, index) => {
    const date = selectedMonthScheduleDates[index];
    return generateScheduleReady
      ? generateDayTypes[date] ?? savedScheduleDayTypes[index]
      : savedScheduleDayTypes[index];
  });
  const scheduleUnavailable =
    payrollScheduleQ.isLoading || payrollScheduleQ.isError || !generateScheduleReady ||
    selectedMonthDayTypes.length !== daysInSelectedMonth;
  const payrollPoliciesUnavailable = payrollSettingsQ.isLoading || payrollSettingsQ.isError;
  const generateSettingsKey = `${genYear}-${genMonth}`;
  const generateSettingsReady =
    payrollSettingsQ.isSuccess && generateSettingsPeriod === generateSettingsKey;
  const configuredGenerateShiftStart = String(payrollSettingsQ.data?.shift_start_time ?? "").slice(0, 5);
  const configuredGenerateShiftEnd = String(payrollSettingsQ.data?.shift_end_time ?? "").slice(0, 5);
  const hasConfiguredGenerateShiftTiming = Boolean(
    payrollSettingsQ.data
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(configuredGenerateShiftStart)
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(configuredGenerateShiftEnd)
      && configuredGenerateShiftEnd > configuredGenerateShiftStart,
  );
  const generateRunSettings = normalizePayrollSettings(generateSettingsForm);
  const generateRunDays = selectedMonthScheduleDates.map((date, index) => ({
    date,
    day_type: selectedMonthDayTypes[index],
  }));
  const overtimeDraftKey = (employeeUuid: string, month: number, year: number) =>
    `${year}-${month}-${employeeUuid}`;
  const overtimeAmountsFor = (employeeUuids: string[]) => Object.fromEntries(
    employeeUuids
      .filter((uuid) => Object.prototype.hasOwnProperty.call(
        overtimeDrafts,
        overtimeDraftKey(uuid, genMonth, genYear),
      ))
      .map((uuid) => {
        const draft = overtimeDrafts[overtimeDraftKey(uuid, genMonth, genYear)];
        return [uuid, draft.trim() === "" ? 0 : Number(draft)];
      }),
  );
  const runOvertimeAmounts = overtimeAmountsFor([...validSelected]);
  const hasInvalidOvertimeDraft = Object.values(runOvertimeAmounts).some(
    (amount) => !Number.isFinite(amount) || amount < 0,
  );
  const generatePayrollFingerprint = JSON.stringify({
    settings: generateRunSettings,
    days: generateRunDays,
    overtimeAmounts: runOvertimeAmounts,
  });
  const canEditPayrollSettings = perms.payroll;
  const setGenerateScheduleEveryDay = (dayType: "working" | "off") =>
    setGenerateDayTypes(Object.fromEntries(
      selectedMonthScheduleDates.map((date) => [date, dayType]),
    ));
  const toggleGenerateWeekday = (weekday: number) =>
    setGenerateDayTypes((current) => {
      const next = { ...current };
      const dates = selectedMonthScheduleDates.filter(
        (date) => new Date(`${date}T00:00:00`).getDay() === weekday,
      );
      const makeWorking = dates.some((date) => {
        const index = selectedMonthScheduleDates.indexOf(date);
        return (next[date] ?? savedScheduleDayTypes[index]) !== "working";
      });
      for (const date of dates) next[date] = makeWorking ? "working" : "off";
      return next;
    });
  const setGenerateScheduleWeekdays = () =>
    setGenerateDayTypes(Object.fromEntries(
      selectedMonthScheduleDates.map((date, index) => [
        date,
        [0, 6].includes(new Date(`${date}T00:00:00`).getDay()) ? "off" : "working",
      ]),
    ));

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

  const openPayrollGeneration = () => {
    setGenMonth(employeeMonth);
    setGenYear(employeeYear);
    setPeriodOpen(true);
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
    {
      uuids: string[];
      month: number;
      year: number;
      settings: PayrollSettings;
      days: PayrollRunDay[];
      overtimeAmounts: Record<string, number>;
    }
  >({
    mutationFn: ({ uuids, month, year, settings, days, overtimeAmounts }) =>
      orgSalaryService.generate({
        month,
        year,
        employee_uuids: uuids.length ? uuids : undefined,
        settings,
        days,
        overtime_amounts: overtimeAmounts,
      }),
    onSuccess: (res, variables) => {
      toast.success(
        res.skipped && res.skipped > 0
          ? t("payroll.generatedSkipped", { count: res.count, skipped: res.skipped })
          : t("payroll.generated", { count: res.count }),
      );
      qc.invalidateQueries({ queryKey: ["orgSalaryRecords"] });
      qc.invalidateQueries({ queryKey: ["orgEmployeesForPayroll"] });
      setOvertimeDrafts((drafts) => {
        const generatedKeys = new Set(variables.uuids.map((uuid) =>
          overtimeDraftKey(uuid, variables.month, variables.year),
        ));
        return Object.fromEntries(
          Object.entries(drafts).filter(([key]) => !generatedKeys.has(key)),
        );
      });
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
    {
      uuids: string[];
      month: number;
      year: number;
      settings: PayrollSettings;
      days: PayrollRunDay[];
      overtimeAmounts: Record<string, number>;
      settingsFingerprint: string;
    }
  >({
    mutationFn: ({ uuids, month, year, settings, days, overtimeAmounts }) =>
      orgSalaryService.preview({
        month,
        year,
        employee_uuids: uuids.length ? uuids : undefined,
        settings,
        days,
        overtime_amounts: overtimeAmounts,
      }),
    onSuccess: () => {
      setPreviewSource("generation");
      setPreviewOpen(true);
    },
  });
  /**
   * Preview a record that has already been generated.
   *
   * A separate mutation, not a reuse of `preview`, because the generation flow
   * keeps its own variables for the regenerate confirmation. Sharing would let
   * a records-table click overwrite the run the user is about to regenerate.
   * The computation is still the same backend preview endpoint, so the modal
   * shows exactly the same breakdown as the generate flow.
   */
  const recordPreview = useMutation<PayrollPreview, Error, SalaryRecord>({
    mutationFn: (record) =>
      orgSalaryService.preview({
        month: Number(record.month),
        year: Number(record.year),
        employee_uuids: [record.employee_uuid],
        ...recordPreviewInputs(record),
      }),
    onSuccess: () => {
      setPreviewSource("record");
      setPreviewOpen(true);
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("payroll.previewFailed", "Preview failed"))),
  });

  /**
   * Both preview flows share one modal. The source decides which mutation's
   * data is displayed, so the generation preview keeps using its live run while
   * a records-table eye click shows that record's own recalculation.
   */
  const activePreview = previewSource === "record"
    ? recordPreview.data
    : previewSource === "generation"
      ? preview.data
      : undefined;
  const activePreviewError = previewSource === "record"
    ? recordPreview.error
    : previewSource === "generation"
      ? preview.error
      : null;
  const activePreviewRecord = previewSource === "record" ? recordPreview.variables : undefined;
  const activePreviewMonth = activePreviewRecord ? Number(activePreviewRecord.month) : genMonth;
  const activePreviewYear = activePreviewRecord ? Number(activePreviewRecord.year) : genYear;
  const previewDialogOpen = previewOpen
    && Boolean(activePreview)
    && (previewSource === "record" || periodOpen);
  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewSource(null);
  };
  const previewMatchesCurrent = preview.isSuccess
    && preview.variables?.month === genMonth
    && preview.variables?.year === genYear
    && preview.variables?.settingsFingerprint === generatePayrollFingerprint
    && JSON.stringify([...(preview.variables?.uuids ?? [])].sort()) === JSON.stringify([...validSelected].sort());

  const regenerate = useMutation<
    {
      items: SalaryRecord[];
      month: number;
      year: number;
      count: number;
    },
    Error,
    {
      uuids: string[];
      month: number;
      year: number;
      settings: PayrollSettings;
      days: PayrollRunDay[];
      overtimeAmounts: Record<string, number>;
    }
  >({
    mutationFn: ({ uuids, month, year, settings, days, overtimeAmounts }) =>
      orgSalaryService.generate({
        month,
        year,
        employee_uuids: uuids,
        regenerate: true,
        settings,
        days,
        overtime_amounts: overtimeAmounts,
      }),
    onSuccess: (res, variables) => {
      toast.success(t("payroll.regenerated", { count: res.count }));
      qc.invalidateQueries({ queryKey: ["orgSalaryRecords"] });
      qc.invalidateQueries({ queryKey: ["orgEmployeesForPayroll"] });
      setOvertimeDrafts((drafts) => {
        const regeneratedKeys = new Set(variables.uuids.map((uuid) =>
          overtimeDraftKey(uuid, variables.month, variables.year),
        ));
        return Object.fromEntries(
          Object.entries(drafts).filter(([key]) => !regeneratedKeys.has(key)),
        );
      });
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

  /**
   * Open the payslip in a new tab rather than saving it.
   *
   * This is the action that runs on a row, because a payslip is READ before it is
   * kept: the old button went straight to a download, and the only way to see
   * what the button produced was to save it somewhere first, name it, and find it
   * again. `window.open` into a blob URL shows the PDF in the browser's own
   * viewer, which is what "preview" meant to everyone who clicked the button.
   *
   * The download stays available — in the dropdown beside this one — for the
   * people who do want the file.
   */
  const previewPayslip = async (record: SalaryRecord) => {
    setPreviewing(record.uuid);
    try {
      const blob = await orgSalaryService.payslip(record.uuid, "inline");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // The tab holds its own reference once opened, so the URL stays valid;
      // revoking immediately would blank the viewer. Waiting a beat covers the
      // case where the popup was blocked and never read the blob at all.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: unknown) {
      toast.error(apiErrorMessage(e, t("payroll.payslipFailed", "Payslip could not be opened")));
    } finally {
      setPreviewing(null);
    }
  };

  const downloadPayslip = async (record: SalaryRecord) => {
    setDownloading(record.uuid);
    try {
      const blob = await orgSalaryService.payslip(record.uuid, "attachment");
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
  const employeePeriodYears = Array.from({ length: 101 }, (_, index) => 2000 + index);

  if (!perms.isOrgAdmin && !perms.payroll) return <AccessDenied feature="payroll" />;

  const moduleLocked = isModuleFlagOff("payroll_management");
  if (moduleLocked) return <ModuleFeatureLockedCard feature="payroll_management" />;

  return (
    <div>
      <PageHeader
        title={t("nav.payroll")}
        description={t("payroll.description")}
        actions={
          tab === "components" || tab === "policies" ? null : tab === "records" ? (
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
                disabled={isLocked || validSelected.size === 0}
                onClick={openPayrollGeneration}
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

      <div className="mt-3">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "employees" | "records" | "components" | "policies")}
          className="mt-0 min-w-0"
        >
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="employees">
              <Users className="mr-1.5 h-4 w-4" />
              {t("payroll.employeesTab", "Employees")}
            </TabsTrigger>
            <TabsTrigger value="records">
              <FileText className="mr-1.5 h-4 w-4" />
              {t("payroll.recordsTab", "Payroll Records")}
            </TabsTrigger>
            <TabsTrigger value="components">Salary Components</TabsTrigger>
            <TabsTrigger value="policies">
              <SlidersHorizontal className="mr-1.5 h-4 w-4" />
              Policies
            </TabsTrigger>
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
                  <Popover open={employeePeriodPickerOpen} onOpenChange={setEmployeePeriodPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="shrink-0">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        {MONTHS[employeeMonth - 1]} {employeeYear}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={new Date(employeeYear, employeeMonth - 1, 1)}
                        month={new Date(employeeYear, employeeMonth - 1, 1)}
                        onMonthChange={(date) => {
                          setEmployeeMonth(date.getMonth() + 1);
                          setEmployeeYear(date.getFullYear());
                        }}
                        onSelect={(date) => {
                          if (!date) return;
                          setEmployeeMonth(date.getMonth() + 1);
                          setEmployeeYear(date.getFullYear());
                          setEmployeePeriodPickerOpen(false);
                        }}
                        captionLayout="dropdown"
                        startMonth={new Date(employeePeriodYears[0], 0)}
                        endMonth={new Date(employeePeriodYears[employeePeriodYears.length - 1], 11)}
                        showOutsideDays={false}
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-xs text-muted-foreground">
                    {filteredEmployees.length} / {allEmployees.length}{" "}
                    {t("payroll.employeeCountSuffix", "employees")}
                  </span>
                </div>

                {employeesQ.isLoading ? (
                  <TableSkeleton />
                ) : employeesQ.isError ? (
                  <div className="p-6">
                    <EmptyState
                      icon={Users}
                      title={t("payroll.employeeLoadFailed")}
                      description={t("payroll.employeeLoadFailedDesc")}
                    />
                  </div>
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
                          <TableHead className="whitespace-nowrap text-right">
                            {t("payroll.basicSalary")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-right">
                            {t("payroll.allowance")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-right">
                            {t("payroll.deduction")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-right">
                            {t("payroll.overtimeAmount", "Overtime")}
                          </TableHead>
                          <TableHead className="whitespace-nowrap text-right">
                            {t("payroll.netSalary")}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEmployees.map((emp: PayrollEmployeeRow) => {
                          const draftKey = overtimeDraftKey(emp.uuid, employeeMonth, employeeYear);
                          const overtimeValue = overtimeDrafts[draftKey] ?? String(emp.overtime_amount);
                          const overtimeAmount = overtimeValue.trim() === "" ? 0 : Number(overtimeValue);
                          const estimatedNet = Number(emp.net_salary) + overtimeAmount - Number(emp.overtime_amount);
                          return (
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
                                <div className="text-xs text-muted-foreground">
                                  <span>{t("payroll.designationCol", "Designation")}: {emp.designation ?? "—"}</span>
                                  <span className="mx-1.5">·</span>
                                  <span>{t("payroll.departmentCol", "Department")}: {emp.department ?? "—"}</span>
                                </div>
                              </TableCell>
                              <TableCell
                                data-label={t("payroll.basicSalary")}
                                className="whitespace-nowrap text-right text-sm"
                              >
                                {emp.basic_salary === null ? "—" : money(emp.basic_salary)}
                              </TableCell>
                              <TableCell
                                data-label={t("payroll.allowance")}
                                className="whitespace-nowrap text-right text-sm"
                              >
                                <div className="space-y-1">
                                  {emp.allowance_items.length > 0 ? emp.allowance_items.map((item, index) => (
                                    <div key={`${item.name}-${index}`} className="flex justify-between gap-3">
                                      <span className="text-muted-foreground">{item.name}</span>
                                      <span>{money(item.amount)}</span>
                                    </div>
                                  )) : <span className="text-muted-foreground">—</span>}
                                  {emp.allowance_items.length > 1 && (
                                    <div className="border-t border-border pt-1 font-medium">
                                      {money(emp.allowances)}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell
                                data-label={t("payroll.deduction")}
                                className="whitespace-nowrap text-right text-sm"
                              >
                                <div className="space-y-1">
                                  {emp.deduction_items.length > 0 ? emp.deduction_items.map((item, index) => (
                                    <div key={`${item.name}-${index}`} className="flex justify-between gap-3">
                                      <span className="text-muted-foreground">{item.name}</span>
                                      <span>{money(item.amount)}</span>
                                    </div>
                                  )) : <span className="text-muted-foreground">—</span>}
                                  {emp.deduction_items.length > 1 && (
                                    <div className="border-t border-border pt-1 font-medium">
                                      {money(emp.deductions)}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell
                                data-label={t("payroll.overtimeAmount", "Overtime")}
                                className="whitespace-nowrap text-right text-sm"
                              >
                                <PayrollOvertimeInput
                                  value={overtimeValue}
                                  savedValue={emp.overtime_amount}
                                  disabled={isLocked}
                                  onChange={(value) => setOvertimeDrafts((drafts) => ({
                                    ...drafts,
                                    [draftKey]: value,
                                  }))}
                                />
                              </TableCell>

                              <TableCell
                                data-label={t("payroll.netSalary")}
                                className="whitespace-nowrap text-right text-sm font-semibold"
                              >
                                {money(estimatedNet)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
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
                  <Select value={recordEmployee || "all"} onValueChange={(v) => { setRecordEmployee(v === "all" ? "" : v); setPage(1); }}>
                    <SelectTrigger className="w-full lg:w-48"><SelectValue placeholder="All employees" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All employees</SelectItem>{(employeesQ.data?.items ?? []).map((e) => <SelectItem key={e.uuid} value={e.uuid}>{e.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={recordDepartment || "all"} onValueChange={(v) => { setRecordDepartment(v === "all" ? "" : v); setPage(1); }}>
                    <SelectTrigger className="w-full lg:w-48"><SelectValue placeholder="All departments" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All departments</SelectItem>{(departmentsQ.data ?? []).map((d) => <SelectItem key={d.uuid} value={d.name}>{d.name}</SelectItem>)}</SelectContent>
                  </Select>
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
                            <TableHead className="whitespace-nowrap text-right">
                              {t("payroll.action", "Action")}
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
                              <TableCell
                                data-label="Period"
                                className="whitespace-nowrap text-sm text-muted-foreground"
                              >
                                {MONTHS[Number(r.month) - 1]} {r.year}
                              </TableCell>
                              <TableCell data-label="Allowances" className="text-right text-sm">
                                <div className="ml-auto w-fit space-y-1">
                                  {(r.lines ?? [])
                                    .filter((line) =>
                                      line.type === "earning"
                                      && line.source !== "basic"
                                      && line.source !== "auto_expense",
                                    )
                                    .map((line, index) => (
                                      <div key={`${line.source}-${line.label}-${index}`} className="flex justify-between gap-3">
                                        <span className="text-left text-muted-foreground">{line.label}</span>
                                        <span className="whitespace-nowrap">{money(line.amount)}</span>
                                      </div>
                                    ))}
                                  {!(r.lines ?? []).some((line) =>
                                    line.type === "earning"
                                    && line.source !== "basic"
                                    && line.source !== "auto_expense",
                                  ) ? (
                                    <div className="text-muted-foreground">
                                      {Number(r.allowances) > 0 ? money(r.allowances) : "—"}
                                    </div>
                                  ) : null}
                                  {!(r.lines ?? []).length && Number(r.allowances) > 0 ? (
                                    <div className="text-xs text-muted-foreground">No itemized breakdown</div>
                                  ) : null}
                                </div>
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
                                {/*
                               * TWO ACTIONS, not one button.

                               A payslip is read before it is kept, so the row
                               offers preview in a new tab as the default and
                               download as the explicit second choice. The old
                               single button downloaded, which meant the only way
                               to SEE what it produced was to save it somewhere
                               and find it again.

                               Both fetch through the same endpoint and the same
                               PDF generator — the only difference is the
                               `Content-Disposition` the server sends — so the
                               preview and the download cannot show two different
                               documents for one record.
                               */}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={previewing === r.uuid || downloading === r.uuid}
                                    >
                                      <FileText className="mr-1 h-3.5 w-3.5" />
                                      {previewing === r.uuid || downloading === r.uuid
                                        ? "…"
                                        : t("payroll.payslip")}
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => previewPayslip(r)}>
                                      <Eye className="mr-2 h-3.5 w-3.5" />
                                      {t("payroll.previewInTab", "Preview in new tab")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => downloadPayslip(r)}>
                                      <Download className="mr-2 h-3.5 w-3.5" />
                                      {t("payroll.downloadPdf", "Download PDF")}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                              <TableCell data-label="Action" className="whitespace-nowrap text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    aria-label={t("payroll.previewTitle", "Payroll preview")}
                                    title={t("payroll.previewTitle", "Payroll preview")}
                                    disabled={isLocked || recordPreview.isPending}
                                    onClick={() => recordPreview.mutate(r)}
                                  >
                                    {recordPreview.isPending && recordPreview.variables?.uuid === r.uuid ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Eye className="h-4 w-4" />
                                    )}
                                  </Button>
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
                                </div>
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
          <TabsContent value="components"><SalaryComponentsManager /></TabsContent>
          <TabsContent value="policies"><PayrollPoliciesPanel canManage={perms.isOrgAdmin} /></TabsContent>
        </Tabs>
      </div>


      {/* ---------- Period-only modal (Year + Month) ---------- */}
      <Dialog
        open={periodOpen}
        onOpenChange={(o) => {
          if (!o) setPeriodOpen(false);
        }}
      >
        <DialogContent className="grid h-[calc(100dvh-0.25rem)] max-h-[calc(100dvh-0.25rem)] w-[calc(100vw-0.25rem)] grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-3 overflow-hidden p-3 sm:h-[calc(100dvh-0.5rem)] sm:max-h-[calc(100dvh-0.5rem)] sm:max-w-[calc(100vw-1rem)] sm:gap-4 sm:p-5">
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
          <div className="flex min-h-0 flex-col gap-2 border-t pt-2 sm:gap-3 sm:pt-3">
            <div className="flex shrink-0 justify-end">
              <Popover open={periodPickerOpen} onOpenChange={setPeriodPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="shrink-0">
                    <CalendarDays className="h-4 w-4" />
                    {MONTHS[genMonth - 1]} {genYear}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={new Date(genYear, genMonth - 1, 1)}
                    month={new Date(genYear, genMonth - 1, 1)}
                    onMonthChange={(date) => {
                      setGenMonth(date.getMonth() + 1);
                      setGenYear(date.getFullYear());
                      setEmployeeMonth(date.getMonth() + 1);
                      setEmployeeYear(date.getFullYear());
                    }}
                    onSelect={(date) => {
                      if (!date) return;
                      setGenMonth(date.getMonth() + 1);
                      setGenYear(date.getFullYear());
                      setEmployeeMonth(date.getMonth() + 1);
                      setEmployeeYear(date.getFullYear());
                      setPeriodPickerOpen(false);
                    }}
                    captionLayout="dropdown"
                    startMonth={new Date(years[0], 0)}
                    endMonth={new Date(years[years.length - 1], 11)}
                    showOutsideDays={false}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-2 sm:gap-4">
              {/* Left: Working days. Flex column so the day grid can take
                  whatever height is left and shrink its cells to fit, instead
                  of being clipped or needing a scrollbar. */}
              <section className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden rounded-md border border-border p-2 sm:gap-3 sm:p-4">
                <div className="flex shrink-0 items-center gap-2 text-sm font-medium">
                  <CalendarDays className="h-4 w-4" />
                  {t("payroll.workingDays")}
                </div>
                {payrollScheduleQ.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {t("payroll.scheduleLoadFailed")}
                  </p>
                ) : payrollScheduleQ.isLoading || !generateScheduleReady ? (
                  <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
                ) : (
                  <>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Button type="button" size="sm" variant="outline" disabled={!canEditPayrollSettings} onClick={() => setGenerateScheduleEveryDay("working")}>
                        {t("payroll.allWorking")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={!canEditPayrollSettings} onClick={() => setGenerateScheduleEveryDay("off")}>
                        {t("payroll.allOff")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={!canEditPayrollSettings} onClick={setGenerateScheduleWeekdays}>
                        {t("payroll.mondayToFriday")}
                      </Button>
                    </div>
                    <div className="mx-auto grid w-full max-w-[560px] shrink-0 grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
                      {Array.from({ length: 7 }, (_, index) => (
                        <button
                          key={index}
                          type="button"
                          disabled={!canEditPayrollSettings}
                          onClick={() => toggleGenerateWeekday(index)}
                          className="cursor-pointer rounded py-0.5 font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                          title={t("payroll.toggleWeekday")}
                        >
                          {new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(
                            new Date(2026, 0, index + 4),
                          )}
                        </button>
                      ))}
                    </div>
                    {/* Day grid: fills the remaining height. auto-rows-fr splits it
                        equally between the 5 or 6 week rows, so every date is always
                        visible without scrolling. */}
                    <div className="mx-auto grid min-h-0 w-full max-w-[560px] flex-1 auto-rows-fr grid-cols-7 gap-1">
                      {Array.from({ length: firstWeekdayInSelectedMonth }, (_, index) => (
                        <div key={`blank-${index}`} />
                      ))}
                      {selectedMonthDayTypes.map((dayType, index) => {
                        const date = selectedMonthScheduleDates[index];
                        return (
                          <button
                            type="button"
                            key={date}
                            disabled={!canEditPayrollSettings}
                            onClick={() =>
                              setGenerateDayTypes((days) => ({
                                ...days,
                                [date]:
                                  selectedMonthDayTypes[index] === "working" ? "off" : "working",
                              }))
                            }
                            className={`flex h-full min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-md border px-0.5 text-center leading-none ${dayType === "working"
                                ? "border-primary/40 bg-primary/10"
                                : "border-border bg-muted"
                              } disabled:cursor-not-allowed disabled:opacity-60`}
                          >
                            <span className="block text-[11px] font-medium leading-4 sm:text-xs">{index + 1}</span>
                            <span className="block text-[8px] leading-3 text-muted-foreground max-[480px]:hidden">
                              {dayType === "working"
                                ? t("payroll.workingDay")
                                : t("payroll.offDay")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {t("payroll.workingDaysCount", {
                          count: selectedMonthDayTypes.filter((day) => day === "working").length,
                        })}
                      </span>
                      <span>
                        {t("payroll.offDaysCount", {
                          count: selectedMonthDayTypes.filter((day) => day === "off").length,
                        })}
                      </span>
                    </div>
                  </>
                )}
              </section>

              {/* Right: run-local policies */}
              <section className="min-h-0 min-w-0 space-y-2 overflow-y-auto rounded-md border border-border p-2 sm:space-y-3 sm:p-4">
                <div>
                  <h3 className="text-sm font-semibold">{t("payroll.policies")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t("payroll.currentPolicies")}
                  </p>
                </div>
                {payrollSettingsQ.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {t("payroll.policiesLoadFailed")}
                  </p>
                ) : !generateSettingsReady ? (
                  <p className="text-sm text-muted-foreground">{t("common.loading", "Loading…")}</p>
                ) : (
                  <>
                    <div className="space-y-2 text-xs sm:space-y-3 sm:text-sm">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <Checkbox
                          checked={generateSettingsForm.salary_calculation_method === "hours"}
                          disabled={!canEditPayrollSettings}
                          onCheckedChange={() => setGenerateSettingsForm((settings) => ({
                            ...settings,
                            salary_calculation_method: "hours",
                          }))}
                          aria-label={t("payroll.salaryByHours")}
                        />
                        <span>{t("payroll.salaryByHours")}</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <Checkbox
                          checked={generateSettingsForm.salary_calculation_method === "days"}
                          disabled={!canEditPayrollSettings}
                          onCheckedChange={() => setGenerateSettingsForm((settings) => ({
                            ...settings,
                            salary_calculation_method: "days",
                          }))}
                          aria-label={t("payroll.salaryByDays")}
                        />
                        <span>{t("payroll.salaryByDays")}</span>
                      </div>
                    </div>
                    <div className="border-t pt-2 text-xs sm:pt-3 sm:text-sm">
                      <div className="mb-2 flex items-center gap-1.5 font-medium sm:gap-2">
                        <Clock className="h-4 w-4" />
                        {t("payroll.shiftTiming")}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="min-w-0 space-y-1">
                          <Label className="text-xs text-muted-foreground">{t("payroll.shiftStart")}</Label>
                          <Input
                            type="time"
                            value={generateSettingsForm.shift_start_time}
                            disabled={!canEditPayrollSettings}
                            onChange={(event) => setGenerateSettingsForm((settings) => ({
                              ...settings,
                              shift_start_time: event.target.value,
                            }))}
                          />
                        </div>
                        <div className="min-w-0 space-y-1">
                          <Label className="text-xs text-muted-foreground">{t("payroll.checkOut")}</Label>
                          <Input
                            type="time"
                            value={generateSettingsForm.shift_end_time}
                            disabled={!canEditPayrollSettings}
                            onChange={(event) => setGenerateSettingsForm((settings) => ({
                              ...settings,
                              shift_end_time: event.target.value,
                            }))}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2 border-t pt-2 text-xs sm:space-y-3 sm:pt-3 sm:text-sm">
                      <label className="flex cursor-pointer items-start gap-2">
                        <Checkbox
                          checked={generateSettingsForm.deduct_salary_for_late_arrivals}
                          disabled={!canEditPayrollSettings}
                          onCheckedChange={(checked) => setGenerateSettingsForm((settings) => ({
                            ...settings,
                            deduct_salary_for_late_arrivals: checked === true,
                          }))}
                        />
                        <span>Deduct Salary for Late Arrivals</span>
                      </label>
                      <div className="space-y-1">
                        <Label htmlFor="generate-late-arrival-threshold" className="text-xs text-muted-foreground">
                          Deduct salary on below number of late arrivals
                        </Label>
                        <Input
                          id="generate-late-arrival-threshold"
                          type="number"
                          min="1"
                          step="1"
                          value={generateSettingsForm.late_arrival_threshold}
                          disabled={
                            !canEditPayrollSettings
                            || !generateSettingsForm.deduct_salary_for_late_arrivals
                            || !hasConfiguredGenerateShiftTiming
                          }
                          onChange={(event) => setGenerateSettingsForm((settings) => ({
                            ...settings,
                            late_arrival_threshold: Number(event.target.value),
                          }))}
                        />
                        {!hasConfiguredGenerateShiftTiming ? (
                          <p className="text-xs text-muted-foreground">
                            Configure organization shift timing first.
                          </p>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="generate-late-grace-minutes" className="text-xs text-muted-foreground">
                          Late grace period (minutes)
                        </Label>
                        <Input
                          id="generate-late-grace-minutes"
                          type="number"
                          min="0"
                          max="180"
                          step="1"
                          value={generateSettingsForm.late_grace_minutes}
                          disabled={!canEditPayrollSettings || !hasConfiguredGenerateShiftTiming}
                          onChange={(event) => setGenerateSettingsForm((settings) => ({
                            ...settings,
                            late_grace_minutes: Number(event.target.value),
                          }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          Employees are on time until {generateSettingsForm.late_grace_minutes} minute(s) after shift start.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </section>
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

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button className="w-full whitespace-normal sm:w-auto"
              variant="ghost"
              onClick={() => setPeriodOpen(false)}
              disabled={generate.isPending || regenerate.isPending || preview.isPending}
            >
              {t("actions.cancel", "Cancel")}
            </Button>
            {/* Preview sits between Cancel and Generate on purpose: the numbers are
                the thing being agreed, so seeing them must not require committing
                to them. */}
            <Button className="w-full whitespace-normal sm:w-auto"
              variant="outline"
              onClick={() =>
                preview.mutate({
                  uuids: [...validSelected],
                  month: genMonth,
                  year: genYear,
                  settings: generateRunSettings,
                  days: generateRunDays,
                  overtimeAmounts: runOvertimeAmounts,
                  settingsFingerprint: generatePayrollFingerprint,
                })
              }
              disabled={generate.isPending || regenerate.isPending || preview.isPending || scheduleUnavailable || payrollPoliciesUnavailable || !generateSettingsReady || hasInvalidOvertimeDraft}
              loading={preview.isPending}
            >
              {t("payroll.preview", { defaultValue: "Preview" })}
            </Button>
            {selectedHasExisting ? (
              <Button className="w-full whitespace-normal sm:w-auto"
                variant="destructive"
                onClick={() => setRegenerateOpen(true)}
                disabled={generate.isPending || regenerate.isPending || !previewMatchesCurrent || scheduleUnavailable || payrollPoliciesUnavailable || !generateSettingsReady || hasInvalidOvertimeDraft}
                loading={regenerate.isPending}
              >
                {t("payroll.regenerateSelected", { count: alreadyGeneratedSelected.length })}
              </Button>
            ) : (
              <Button className="w-full whitespace-normal sm:w-auto"
                onClick={() =>
                  generate.mutate({
                    uuids: [...validSelected],
                    month: genMonth,
                    year: genYear,
                    settings: generateRunSettings,
                    days: generateRunDays,
                    overtimeAmounts: runOvertimeAmounts,
                  })
                }
                disabled={generate.isPending || regenerate.isPending || !previewMatchesCurrent || scheduleUnavailable || payrollPoliciesUnavailable || !generateSettingsReady || hasInvalidOvertimeDraft}
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
        open={previewDialogOpen}
        onOpenChange={(o) => {
          if (!o) closePreview();
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-h-[calc(100dvh-1rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("payroll.previewTitle", { defaultValue: "Payroll preview" })}
            </DialogTitle>
            <DialogDescription>
              {t("payroll.previewDesc", {
                period: `${MONTHS[activePreviewMonth - 1]} ${activePreviewYear}`,
                count: activePreview?.count ?? 0,
                defaultValue:
                  "For {{period}}, {{count}} employee(s). Nothing is saved — generating payroll afterwards will store exactly these figures.",
              })}
            </DialogDescription>
          </DialogHeader>

          {activePreviewError ? (
            <p className="text-sm text-destructive">
              {apiErrorMessage(activePreviewError, t("payroll.previewFailed", "Preview failed"))}
            </p>
          ) : null}

          <div className="space-y-3">
            {(activePreview?.items ?? []).map((item) => {
              const a = item.attendance;
              const isHoursBased = item.rates.salary_calculation_method === "hours";
              const savedExpenseLine = activePreviewRecord?.lines?.find((line) => line.source === "auto_expense");
              const reimbursement = activePreviewRecord
                ? Number(activePreviewRecord.expense_reimbursement) || 0
                : Number(item.expense_reimbursement) || 0;
              const calculatedReimbursement = Number(item.expense_reimbursement) || 0;
              const previewNet = Number(item.net_salary) - calculatedReimbursement + reimbursement;
              const auto = item.lines.filter((l) => l.source !== "component" && l.source !== "auto_expense");
              const expenseClaims = previewSource === "generation"
                ? item.expense_reimbursement_details?.claims ?? []
                : [];
              return (
                <div key={item.employee_uuid} className="rounded-md border p-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{item.employee_name}</span>
                    <span className="font-mono text-sm font-semibold">
                      {item.rates.currency} {money(previewNet)}
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-5">
                    <div>
                      <span className="text-muted-foreground">
                        {t("payroll.previewWorkingDays", "Total Working Days")}
                      </span>
                      <p className="font-medium">{a.working_days}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("payroll.previewAttended", "Attended Days")}
                      </span>
                      <p className="font-medium">{a.attended_days}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("payroll.previewUnpaidLeave", "Unpaid Leave")}
                      </span>
                      <p className="font-medium">{a.unpaid_leave_days} day(s)</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("payroll.previewPaidLeave", "Paid Leave")}
                      </span>
                      <p className="font-medium">{a.paid_leave_days} day(s)</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        {t("payroll.previewLate", "Late arrivals")}
                      </span>
                      <p className="font-medium">{a.late_count}</p>
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

                  {reimbursement > 0 ? (
                    <div className="mt-2 space-y-1 border-t pt-2 text-xs">
                      {expenseClaims.length > 0 ? expenseClaims.map((claim) => (
                        <div key={claim.uuid} className="flex justify-between gap-3">
                          <span className="text-muted-foreground">
                            Expense reimbursement — {claim.expense_name} ({claim.expense_date})
                          </span>
                          <span className="shrink-0 font-mono font-medium text-emerald-600 dark:text-emerald-400">
                            +{item.rates.currency} {money(claim.amount)}
                          </span>
                        </div>
                      )) : (
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">
                            {savedExpenseLine?.label ?? t("orgPayroll.expenseReimbursement", "Expense reimbursement")}
                          </span>
                          <span className="shrink-0 font-mono font-medium text-emerald-600 dark:text-emerald-400">
                            +{item.rates.currency} {money(reimbursement)}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : null}

                  <p className="mt-2 text-xs text-muted-foreground">
                    {isHoursBased
                      ? `Salary basis: ${item.rates.divisor} scheduled hours · hourly rate ${item.rates.currency} ${money(item.rates.hourly)}`
                      : item.rates.divisor === a.working_days
                        ? `Salary basis: ${item.rates.divisor} working days · daily rate ${item.rates.currency} ${money(item.rates.per_day)}`
                        : `Salary basis: ${item.rates.divisor} working days after joining (of ${a.working_days} this month) · daily rate ${item.rates.currency} ${money(item.rates.per_day)}`}
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
            <Button variant="outline" onClick={closePreview}>
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
        onConfirm={() => {
          const previewedRun = preview.variables;
          if (!previewedRun || !previewMatchesCurrent) {
            toast.error(t("payroll.previewStale"));
            return;
          }
          regenerate.mutate({
            uuids: alreadyGeneratedSelected,
            month: genMonth,
            year: genYear,
            settings: previewedRun.settings,
            days: previewedRun.days,
            overtimeAmounts: overtimeAmountsFor(alreadyGeneratedSelected),
          });
        }}
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


function PayrollPoliciesPanel({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [settingsForm, setSettingsForm] = useState<PayrollSettings>({
    salary_calculation_method: "days",
    calculate_overtime: false,
    shift_start_time: "09:00",
    shift_end_time: "17:00",
    overtime_multiplier: 1.5,
    deduct_salary_for_late_arrivals: false,
    late_arrival_threshold: 1,
    late_grace_minutes: 10,
  });
  const settingsQ = useQuery({
    queryKey: ["orgPayrollSettings", month, year],
    queryFn: () => orgSalaryService.settings(month, year),
    refetchOnMount: "always",
  });
  const scheduleQ = useQuery({
    queryKey: ["orgPayrollSchedule", month, year],
    queryFn: () => orgSalaryService.schedule(month, year),
    enabled: scheduleOpen,
  });
  const [dayTypes, setDayTypes] = useState<Record<string, "working" | "off">>({});
  useEffect(() => {
    if (!settingsQ.isSuccess) return;
    const settings = settingsQ.data ?? {
      salary_calculation_method: "days" as const,
      calculate_overtime: false,
      shift_start_time: "09:00",
      shift_end_time: "17:00",
      overtime_multiplier: 1.5,
      deduct_salary_for_late_arrivals: false,
      late_arrival_threshold: 1,
      late_grace_minutes: 10,
    };
    setSettingsForm({
      ...settings,
      calculate_overtime: false,
      shift_start_time: String(settings.shift_start_time).slice(0, 5),
      shift_end_time: String(settings.shift_end_time).slice(0, 5),
      deduct_salary_for_late_arrivals: settings.deduct_salary_for_late_arrivals ?? false,
      late_arrival_threshold: Number(settings.late_arrival_threshold ?? 1),
      late_grace_minutes: Number(settings.late_grace_minutes ?? 10),
    });
  }, [settingsQ.data, settingsQ.isSuccess]);
  const configuredShiftStart = String(settingsQ.data?.shift_start_time ?? "").slice(0, 5);
  const configuredShiftEnd = String(settingsQ.data?.shift_end_time ?? "").slice(0, 5);
  const hasConfiguredShiftTiming = Boolean(
    settingsQ.data
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(configuredShiftStart)
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(configuredShiftEnd)
      && configuredShiftEnd > configuredShiftStart,
  );
  useEffect(() => {
    if (!scheduleOpen) return;
    const total = new Date(year, month, 0).getDate();
    const next: Record<string, "working" | "off"> = {};
    for (let day = 1; day <= total; day++) {
      const date = new Date(year, month - 1, day);
      const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      next[key] = date.getDay() === 0 || date.getDay() === 6 ? "off" : "working";
    }
    const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
    for (const item of scheduleQ.data?.days ?? []) {
      const scheduleDate = String(item.schedule_date ?? "").slice(0, 10);
      if (scheduleDate.slice(0, 7) === monthPrefix && Object.prototype.hasOwnProperty.call(next, scheduleDate)) {
        next[scheduleDate] = item.day_type;
      }
    }
    setDayTypes(next);
  }, [scheduleOpen, scheduleQ.data, month, year]);
  const saveSettings = useMutation({
    mutationFn: () => orgSalaryService.saveSettings({ ...settingsForm, month, year }),
    onSuccess: async (settings) => {
      qc.setQueryData(["orgPayrollSettings", month, year], settings);
      toast.success("Payroll settings saved");
      await qc.invalidateQueries({ queryKey: ["orgPayrollSettings"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not save payroll settings"),
  });
  const saveSchedule = useMutation({
    mutationFn: () => orgSalaryService.saveSchedule({
      month, year,
      days: scheduleDates.map((date) => ({ date, day_type: dayTypes[date] })),
    }),
    onSuccess: () => { toast.success("Monthly working schedule saved"); qc.invalidateQueries({ queryKey: ["orgPayrollSchedule", month, year] }); setScheduleOpen(false); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not save monthly schedule"),
  });
  const daysInMonth = new Date(year, month, 0).getDate();
  const scheduleDates = Array.from({ length: daysInMonth }, (_, i) =>
    `${year}-${String(month).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
  );
  const isScheduleComplete = scheduleDates.every((date) => dayTypes[date] === "working" || dayTypes[date] === "off");
  const weekendWorkingCount = scheduleDates.filter((date) => {
    const weekday = new Date(`${date}T00:00:00`).getDay();
    return (weekday === 0 || weekday === 6) && dayTypes[date] === "working";
  }).length;
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const policyYears = Array.from({ length: 101 }, (_, index) => 2000 + index);

  /** No requirement that Sat/Sun be off: any weekday can be working. */
  const setEveryDay = (value: "working" | "off") =>
    setDayTypes(() => {
      const next: Record<string, "working" | "off"> = {};
      for (const date of scheduleDates) next[date] = value;
      return next;
    });

  /** Weekend preset, for the common Saturday+Sunday-off week. */
  const setSatSunOff = () =>
    setDayTypes(() => {
      const next: Record<string, "working" | "off"> = {};
      for (const date of scheduleDates) {
        // Local midnight on purpose: parsing "YYYY-MM-DDT00:00:00" keeps the
        // calendar date, while new Date("YYYY-MM-DD") is parsed as UTC and can
        // land on the previous weekday west of Greenwich.
        const weekday = new Date(`${date}T00:00:00`).getDay();
        next[date] = weekday === 0 || weekday === 6 ? "off" : "working";
      }
      return next;
    });

  /** Flip every occurrence of one weekday, so a Fri/Sat or 6-day week is one click. */
  const toggleWeekday = (weekday: number) =>
    setDayTypes((s) => {
      const next = { ...s };
      const dates = scheduleDates.filter((date) => new Date(`${date}T00:00:00`).getDay() === weekday);
      const makeWorking = dates.some((date) => next[date] !== "working");
      for (const date of dates) next[date] = makeWorking ? "working" : "off";
      return next;
    });
  return (
    <>
      <Card className="border-border/70 shadow-none">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          {/* Working days — left, its own panel so it does not bury the policies. */}
          <div className="flex h-fit flex-col gap-3 rounded-md border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CalendarDays className="h-4 w-4" /> Working Days
            </div>
            <p className="text-xs text-muted-foreground">
              Set every date as a working day or an off day separately for each month.
            </p>
            <Button className="w-full" variant="outline" disabled={!canManage} onClick={() => setScheduleOpen(true)}>
              Set Working Days
            </Button>
          </div>

          {/* Policies — right. */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div><h3 className="font-semibold">Policies</h3><p className="text-xs text-muted-foreground">Choose policies for this month.</p></div>
              <Popover open={periodPickerOpen} onOpenChange={setPeriodPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="shrink-0">
                    <CalendarDays className="h-4 w-4" />
                    {monthNames[month - 1]} {year}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={new Date(year, month - 1, 1)}
                    month={new Date(year, month - 1, 1)}
                    onMonthChange={(date) => {
                      setMonth(date.getMonth() + 1);
                      setYear(date.getFullYear());
                    }}
                    onSelect={(date) => {
                      if (!date) return;
                      setMonth(date.getMonth() + 1);
                      setYear(date.getFullYear());
                      setPeriodPickerOpen(false);
                    }}
                    captionLayout="dropdown"
                    startMonth={new Date(policyYears[0], 0)}
                    endMonth={new Date(policyYears[policyYears.length - 1], 11)}
                    showOutsideDays={false}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={settingsForm.salary_calculation_method === "hours"} disabled={!canManage} onCheckedChange={() => setSettingsForm((s) => ({ ...s, salary_calculation_method: "hours" }))} />
                <span>Calculate salary according to working hours</span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={settingsForm.salary_calculation_method === "days"} disabled={!canManage} onCheckedChange={() => setSettingsForm((s) => ({ ...s, salary_calculation_method: "days" }))} />
                <span>Calculate salary according to working days</span>
              </label>
            </div>
            <div className="space-y-3 border-t pt-3">
              {settingsQ.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  {apiErrorMessage(settingsQ.error, "Could not load payroll policies. Check the database migration and try again.")}
                </p>
              ) : null}
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={settingsForm.deduct_salary_for_late_arrivals}
                  disabled={!canManage}
                  onCheckedChange={(checked) => setSettingsForm((s) => ({
                    ...s,
                    deduct_salary_for_late_arrivals: checked === true,
                  }))}
                />
                <span>Deduct Salary for Late Arrivals</span>
              </label>
              <div className="space-y-1">
                <Label htmlFor="late-arrival-threshold" className="text-xs">
                  Deduct salary on below number of late arrivals
                </Label>
                <Input
                  id="late-arrival-threshold"
                  type="number"
                  min="1"
                  step="1"
                  value={settingsForm.late_arrival_threshold}
                  disabled={!canManage || !settingsForm.deduct_salary_for_late_arrivals || !hasConfiguredShiftTiming}
                  onChange={(event) => setSettingsForm((s) => ({
                    ...s,
                    late_arrival_threshold: Number(event.target.value),
                  }))}
                />
                {!hasConfiguredShiftTiming ? (
                  <p className="text-xs text-muted-foreground">Configure organization shift timing first.</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="late-grace-minutes" className="text-xs">
                  Late grace period (minutes)
                </Label>
                <Input
                  id="late-grace-minutes"
                  type="number"
                  min="0"
                  max="180"
                  step="1"
                  value={settingsForm.late_grace_minutes}
                  disabled={!canManage || !hasConfiguredShiftTiming}
                  onChange={(event) => setSettingsForm((s) => ({
                    ...s,
                    late_grace_minutes: Number(event.target.value),
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  Employees are on time until {settingsForm.late_grace_minutes} minute(s) after shift start.
                </p>
              </div>
            </div>
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Clock className="h-4 w-4" /> Organization shift timing</div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Shift start</Label><Input type="time" value={settingsForm.shift_start_time.slice(0, 5)} disabled={!canManage} onChange={(e) => setSettingsForm((s) => ({ ...s, shift_start_time: e.target.value }))} /></div>
                <div><Label className="text-xs">Check-out</Label><Input type="time" value={settingsForm.shift_end_time.slice(0, 5)} disabled={!canManage} onChange={(e) => setSettingsForm((s) => ({ ...s, shift_end_time: e.target.value }))} /></div>
              </div>
            </div>
            {canManage ? <Button className="w-full sm:w-auto" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending || settingsQ.isLoading}>Save Policies</Button> : null}
          </div>
        </CardContent>
      </Card>
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Monthly Working Schedule</DialogTitle><DialogDescription>Choose working days and off days for the selected month.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{monthNames.map((name, i) => <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>)}</SelectContent></Select>
            <Input type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Quick set:</span>
            <Button type="button" size="sm" variant="outline" disabled={!canManage} onClick={() => setEveryDay("working")}>All working</Button>
            <Button type="button" size="sm" variant="outline" disabled={!canManage} onClick={() => setEveryDay("off")}>All off</Button>
            <Button type="button" size="sm" variant="outline" disabled={!canManage} onClick={setSatSunOff}>Apply Mon–Fri schedule</Button>
          </div>
          {weekendWorkingCount > 0 ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              {weekendWorkingCount} Saturday/Sunday date(s) are currently marked as working. If your organization follows a Monday–Friday week, apply the Mon–Fri schedule before saving payroll settings.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">You can still customize any weekday or individual date after applying the preset.</p>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {weekdayNames.map((name, weekday) => (
              <button
                key={name}
                type="button"
                disabled={!canManage}
                onClick={() => toggleWeekday(weekday)}
                title={`Toggle every ${name} in this month`}
                className="cursor-pointer rounded-md py-1 font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }, (_, i) => <div key={"blank" + i} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1; const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const type = dayTypes[date] ?? "off";
              return <button key={date} type="button" disabled={!canManage} onClick={() => setDayTypes((s) => ({ ...s, [date]: s[date] === "working" ? "off" : "working" }))} className={`rounded-md border p-2 text-sm ${type === "working" ? "border-primary bg-primary/10" : "border-border bg-muted"}`}><span className="block font-medium">{day}</span><span className="block text-[9px]">{type === "working" ? "Working" : "Off"}</span></button>;
            })}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>Working days: {Object.values(dayTypes).filter((v) => v === "working").length}</span><span>Off days: {Object.values(dayTypes).filter((v) => v === "off").length}</span></div>
          <DialogFooter><Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button><Button onClick={() => saveSchedule.mutate()} disabled={!canManage || scheduleQ.isLoading || saveSchedule.isPending || !isScheduleComplete}>Save Monthly Schedule</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
