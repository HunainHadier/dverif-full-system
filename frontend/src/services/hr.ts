/**
 * HR operations: leave, attendance, salary components, payroll.
 *
 *  * The cluster the module expansion grows out of, so it is organised per module
 *  * rather than per resource as each new module lands.
 *
 * Split out of the former single-file services/index.ts. Nothing here may import
 * anything except "@/lib/api" and "./core": services importing from lib/ would
 * close a runtime import cycle via lib/api -> lib/auth -> services.
 */

import { api, type Paginated } from "@/lib/api";

import type {
  UUID,
  LeaveType,
  LeaveRequest,
  LeaveBalance,
  EmployeeLeaveAllocation,
  EmployeeLeaveAllocationHistory,
  AttendanceRecord,
  IpRule,
  SalaryRecord,
  SalaryComponent,
  SalaryHistoryEntry,
  EmployeeSalaryComponent,
} from "./core";
export const leavesService = {
  types: () => api.get<{ leaveTypes: LeaveType[] }>("/leaves/types").then((r) => r.data.leaveTypes),
  balance: () =>
    api.get<{ balances: LeaveBalance[] }>("/leaves/balance").then((r) => r.data.balances),
  mine: (
    params: {
      page?: number;
      limit?: number;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) => api.get<Paginated<LeaveRequest>>("/leaves/mine", { params }).then((r) => r.data),
  create: (data: {
    leave_type_id: number;
    requested_treatment: "paid" | "unpaid";
    start_date: string;
    end_date: string;
    reason?: string;
  }) => api.post<{ leaveRequest: LeaveRequest }>("/leaves", data).then((r) => r.data.leaveRequest),
  decide: (uuid: UUID, data: { status: "approved" | "rejected"; approved_treatment?: "paid" | "unpaid" }) =>
    api
      .patch<{ leaveRequest: LeaveRequest }>(`/leaves/${uuid}/decide`, data)
      .then((r) => r.data.leaveRequest),
};

export const orgLeavesService = {
  types: () =>
    api.get<{ leaveTypes: LeaveType[] }>("/org/leave-types").then((r) => r.data.leaveTypes),
  createType: (data: { name: string; days_allowed_per_year?: number }) =>
    api.post<{ leaveType: LeaveType }>("/org/leave-types", data).then((r) => r.data.leaveType),
  updateType: (id: number, data: { name: string; days_allowed_per_year?: number }) =>
    api.put<{ leaveType: LeaveType }>(`/org/leave-types/${id}`, data).then((r) => r.data.leaveType),
  deleteType: (id: number) => api.delete(`/org/leave-types/${id}`).then((r) => r.data),
  list: (params: { page?: number; limit?: number; status?: string; search?: string } = {}) =>
    api.get<Paginated<LeaveRequest>>("/org/leaves", { params }).then((r) => r.data),
  decide: (uuid: UUID, data: { status: "approved" | "rejected"; approved_treatment?: "paid" | "unpaid" }) =>
    api
      .patch<{ leaveRequest: LeaveRequest }>(`/leaves/${uuid}/decide`, data)
      .then((r) => r.data.leaveRequest),
};

export const orgLeaveAllocationService = {
  list: (year: number) =>
    api
      .get<{
        year: number;
        leaveTypes: LeaveType[];
        designations: { uuid: UUID; name: string }[];
        employees: EmployeeLeaveAllocation[];
      }>("/org/leave-allocations", { params: { year } })
      .then((r) => r.data),
  set: (data: {
    employee_uuid: UUID;
    leave_type_id: number;
    year: number;
    allocated_days: number;
  }) =>
    api
      .put<{ allocation: { id: number; allocated_days: number } }>("/org/leave-allocations", data)
      .then((r) => r.data),
  setByDesignation: (data: {
    designation_uuid: UUID;
    leave_type_id: number;
    year: number;
    allocated_days: number;
  }) =>
    api
      .put<{ employee_count: number }>("/org/leave-allocations/designation", data)
      .then((r) => r.data),
  employeeHistory: (employee_uuid: UUID) =>
    api
      .get<{
        employee_uuid: UUID;
        employee_name: string;
        employee_email: string;
        allocations: EmployeeLeaveAllocationHistory[];
      }>(`/org/employees/${employee_uuid}/leave-allocations`)
      .then((r) => r.data),
};

export const orgAttendanceService = {
  list: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      status?: string;
    } = {},
  ) => api.get<Paginated<AttendanceRecord>>("/org/attendance", { params }).then((r) => r.data),
  ips: () =>
    api.get<{ allowedIps: string[]; rules: IpRule[] }>("/org/attendance/ips").then((r) => r.data),
  addIp: (ip: string) =>
    api
      .post<{ allowedIps: string[]; rules: IpRule[] }>("/org/attendance/ips", { ip })
      .then((r) => r.data),
removeIp: (id: number) =>
      api
        .delete<{ allowedIps: string[]; rules: IpRule[] }>(`/org/attendance/ips/${id}`)
        .then((r) => r.data),
    /**
     * Back-office attendance entry.
     *
     * The IP allowlist only governs the self-service check-in endpoint, so an
     * employee working from a new site, on a field visit, or whose device sits
     * behind a dynamic IP cannot record their own day at all. This is the
     * admin-side path for that case. The backend requires a `reason` on every
     * entry and caps how far back it can be dated, so both are surfaced in the
     * form rather than left to fail as a validation error after submitting.
     */
    manualEntry: (data: {
      employee_uuid: UUID;
      date: string;
      check_in_time: string;
      check_out_time?: string;
      reason: string;
    }) =>
      api
        .post<{ record: AttendanceRecord }>("/org/attendance/manual-entry", data)
        .then((r) => r.data),
  };

/**
 * One line on a payslip.
 *
 * `source` is what separates "what we agreed" from "what actually happened": a
 * component is a standing arrangement an admin configured, an automatic line is
 * derived from a specific leave request or a specific month of attendance. An
 * employee disputing a payslip needs to be told which of the two they are
 * looking at, and `basisValue`/`basisUnit` are the arithmetic behind the amount.
 */
export type PayrollLine = {
  label: string;
  type: "earning" | "deduction";
  source:
    | "basic"
    | "component"
    | "auto_unpaid_leave"
    | "auto_absenteeism"
    | "auto_late"
    | "auto_overtime"
    | "manual";
  amount: number;
  basis_value: number | null;
  basis_unit: "days" | "hours" | "late_arrivals" | null;
};

export type PayrollPreviewItem = {
  employee_uuid: UUID;
  employee_name: string;
  basic_salary: number | string;
  allowances: number | string;
  deductions: number | string;
  expense_reimbursement: number | string;
  net_salary: number | string;
  lines: PayrollLine[];
  attendance: {
    working_days: number;
    attended_days: number;
    worked_hours: number;
    absent_days: number;
    late_count: number;
    paid_leave_days: number;
    unpaid_leave_days: number;
    approved_overtime_hours: number;
    holidays_in_month: number;
  };
  rates: {
    per_day: number;
    hourly: number;
    divisor: number;
    salary_calculation_method: "hours" | "days";
    expected_hours: number;
    worked_hours: number;
    payable_ratio: number;
    currency: string;
    /**
     * Why there are no automatic lines: "no_working_days" or "no_basic_salary".
     * Surfaced rather than left as an unexplained empty list, which reads as
     * "nothing to report" when it actually means "could not be computed".
     */
    skip_reason: string | null;
  };
};

export type PayrollPreview = {
  month: number;
  year: number;
  items: PayrollPreviewItem[];
  totals: {
    basic: number | string;
    allowances: number | string;
    deductions: number | string;
    expense_reimbursement: number | string;
    net: number | string;
  };
  count: number;
};

export type PayrollSettings = {
  salary_calculation_method: "hours" | "days";
  calculate_overtime: boolean;
  shift_start_time: string;
  shift_end_time: string;
  overtime_multiplier: number;
};

export type MonthlyWorkDay = { date: string; day_type: "working" | "off" };

export const orgSalaryService = {
  settings: () => api.get<{ settings: PayrollSettings | null }>("/org/payroll-settings").then((r) => r.data.settings),
  saveSettings: (data: PayrollSettings) => api.put<{ settings: PayrollSettings }>("/org/payroll-settings", data).then((r) => r.data.settings),
  schedule: (month: number, year: number) => api.get<{ month: number; year: number; days: MonthlyWorkDay[] }>("/org/payroll-schedule", { params: { month, year } }).then((r) => r.data),
  saveSchedule: (data: { month: number; year: number; days: MonthlyWorkDay[] }) => api.put<{ month: number; year: number; days: MonthlyWorkDay[] }>("/org/payroll-schedule", data).then((r) => r.data),
  list: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      employee_uuid?: string;
      month?: number;
      year?: number;
    } = {},
  ) => api.get<Paginated<SalaryRecord>>("/org/salary-records", { params }).then((r) => r.data),
  /**
   * Compute payroll for a period WITHOUT writing anything.
   *
   * Same endpoint shape as generate, one word different, and the difference is
   * the whole point: automatic deductions are the part of a payslip people
   * contest, so the numbers have to be inspectable before they are committed
   * rather than discovered a month later from a stored total. The backend runs
   * the identical computation the generate path runs, so what is previewed and
   * what is committed cannot diverge.
   */
  preview: (data: { month: number; year: number; employee_uuids?: UUID[] }) =>
    api.post<PayrollPreview>("/org/payroll/preview", data).then((r) => r.data),
  generate: (data: {
    month: number;
    year: number;
    employee_uuids?: UUID[];
    regenerate?: boolean;
  }) =>
    api
      .post<{
        items: SalaryRecord[];
        month: number;
        year: number;
        count: number;
        skipped?: number;
        message?: string;
      }>("/org/payroll/generate", data)
      .then((r) => r.data),
  exportCsv: async (
    params: { search?: string; employee_uuid?: string; month?: number; year?: number } = {},
  ) => {
    const r = await api.get("/org/salary-records/export", { params, responseType: "blob" });
    return r.data as Blob;
  },
  /**
   * Fetch the payslip PDF.
   *
   * `view` sets the `Content-Disposition` the server sends — `inline` lets the
   * browser render it in a tab, `attachment` saves a file. It does NOT change
   * what is rendered: both go through the same controller, the same query and
   * the same `generatePayslipPdf`, so the preview and the download are the same
   * document. That is the guarantee the requirement asks for, and it only holds
   * because there is one endpoint rather than two.
   */
  payslip: async (uuid: UUID, view?: "inline" | "attachment") => {
    const r = await api.get(`/org/salary-records/${uuid}/payslip`, {
      responseType: "blob",
      params: view ? { view } : undefined,
    });
    return r.data as Blob;
  },
  deleteRecord: (uuid: UUID) => api.delete(`/org/salary-records/${uuid}`).then((r) => r.data),
  deletePeriod: (month: number, year: number) =>
    api.delete(`/org/salary-records/period/${year}/${month}`).then((r) => r.data),
};

export const salaryComponentService = {
  list: (type?: "allowance" | "deduction") =>
    api
      .get<{ items: SalaryComponent[] }>("/org/salary-components", { params: type ? { type } : {} })
      .then((r) => r.data.items),
  create: (data: {
    name: string;
    type: "allowance" | "deduction";
    is_percentage: boolean;
    is_active?: boolean;
  }) =>
    api
      .post<{ component: SalaryComponent }>("/org/salary-components", data)
      .then((r) => r.data.component),
  update: (uuid: UUID, data: { name: string; is_percentage: boolean; is_active?: boolean }) =>
    api
      .put<{ component: SalaryComponent }>(`/org/salary-components/${uuid}`, data)
      .then((r) => r.data.component),
  toggleStatus: (uuid: UUID) =>
    api
      .patch<{ component: SalaryComponent }>(`/org/salary-components/${uuid}/status`)
      .then((r) => r.data.component),
  remove: (uuid: UUID) => api.delete(`/org/salary-components/${uuid}`).then((r) => r.data),
};

export const orgEmployeeSalaryService = {
  history: (employeeUuid: UUID) =>
    api
      .get<{ history: SalaryHistoryEntry[] }>(`/org/employees/${employeeUuid}/salary-history`)
      .then((r) => r.data.history),
  increment: (employeeUuid: UUID, data: { new_basic_salary: number; effective_from: string }) =>
    api
      .post<{ history: SalaryHistoryEntry[] }>(
        `/org/employees/${employeeUuid}/increment-salary`,
        data,
      )
      .then((r) => r.data.history),
  update: (
    employeeUuid: UUID,
    historyUuid: UUID,
    data: { basic_salary?: number; effective_from?: string },
  ) =>
    api
      .put<{ history: SalaryHistoryEntry[] }>(
        `/org/employees/${employeeUuid}/salary-history/${historyUuid}`,
        data,
      )
      .then((r) => r.data.history),
  remove: (employeeUuid: UUID, historyUuid: UUID) =>
    api
      .delete<{ history: SalaryHistoryEntry[] }>(
        `/org/employees/${employeeUuid}/salary-history/${historyUuid}`,
      )
      .then((r) => r.data.history),
  components: (employeeUuid: UUID) =>
    api
      .get<{ assignments: EmployeeSalaryComponent[] }>(
        `/org/employees/${employeeUuid}/salary-components`,
      )
      .then((r) => r.data.assignments),
  assignComponent: (employeeUuid: UUID, data: { salary_component_id: number; amount: number }) =>
    api
      .post<{ assignments: EmployeeSalaryComponent[] }>(
        `/org/employees/${employeeUuid}/salary-components`,
        data,
      )
      .then((r) => r.data.assignments),
  updateComponent: (
    employeeUuid: UUID,
    assignUuid: UUID,
    data: { amount?: number; is_active?: boolean },
  ) =>
    api
      .put<{ assignments: EmployeeSalaryComponent[] }>(
        `/org/employees/${employeeUuid}/salary-components/${assignUuid}`,
        data,
      )
      .then((r) => r.data.assignments),
  removeComponent: (employeeUuid: UUID, assignUuid: UUID) =>
    api
      .delete<{ assignments: EmployeeSalaryComponent[] }>(
        `/org/employees/${employeeUuid}/salary-components/${assignUuid}`,
      )
      .then((r) => r.data.assignments),
};

/* ======================== HR LETTERS ======================== */

export type HrLetterType =
  | "offer"
  | "increment"
  | "experience"
  | "employment_confirmation"
  | "warning"
  | "appreciation"
  | "custom";

export const HR_LETTER_TYPES: { key: HrLetterType; label: string }[] = [
  { key: "offer", label: "Offer Letter" },
  { key: "increment", label: "Salary Increment Letter" },
  { key: "experience", label: "Experience Letter" },
  { key: "employment_confirmation", label: "Employment Confirmation Letter" },
  { key: "warning", label: "Warning Letter" },
  { key: "appreciation", label: "Appreciation Letter" },
  { key: "custom", label: "Custom Letter" },
];

export type LetterTemplate = {
  uuid: UUID;
  letter_type: HrLetterType;
  name: string;
  body: string;
  merge_fields?: string[] | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

/** A tag the system cannot fill by itself; the issue form must collect these. */
export type MergeTag = { tag: string; label: string; source: string; help?: string; letter_types?: HrLetterType[] };

export type HrLetterStatus = "draft" | "issued" | "revoked";

export type HrLetter = {
  uuid: UUID;
  organization_id?: number;
  employee_uuid: string;
  employee_name?: string;
  employee_designation?: string | null;
  template_uuid?: string | null;
  letter_type: HrLetterType;
  reference_no: string;
  title: string;
  payload?: Record<string, string> | null;
  body_snapshot?: string | null;
  status: HrLetterStatus;
  issued_at?: string | null;
  revoked_at?: string | null;
  revoked_reason?: string | null;
  created_at: string;
  qr_token?: string | null;
  verify_url?: string | null;
};

export type HrLetterListItem = HrLetter & { employee_uuid: string };

export type TemplatePreview = {
  text: string;
  /** Tags referenced but with no value; issuance refuses while any remain. */
  unresolved: string[];
  /** Tags with no known source at all === a template bug, not a missing value. */
  unknown: string[];
  /**
   * The subset of `unresolved` the issue form must collect from a person.
   *
   * Wider than "the manual tags": an auto tag that is merely EMPTY for this
   * employee (no CNIC on file, no joining date recorded) belongs here too.
   * Otherwise submit stays disabled with no input on screen to re-enable it,
   * and the letter cannot be issued at all.
   */
  missing_manual: string[];
  /** Tag -> friendly label, e.g. cnic -> "CNIC". Presentation only. */
  tag_labels?: Record<string, string>;
};

/**
 * Coerce a JSON-ish value into a real array.
 *
 * MySQL JSON columns arrive from the API as STRINGS, so `merge_fields` can be
 * '["employee_name","new_salary"]'. A stale cache from an older backend build can
 * carry the same shape even after the server-side fix ships. Either way, calling
 * .slice().map() on it throws "tags.slice(...).map is not a function".
 *
 * Normalising HERE, at the boundary, means no component ever has to defend
 * against it — the declared `string[]` type is finally true everywhere. The
 * backend now parses these columns too (services/hrLetters.service.js); this is
 * the second line of defence for anything that bypasses it.
 */
export function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Coerce a tag->label map into a plain object.
 *
 * Same JSON-column caveat as toStringArray: it can arrive as a string, and an
 * older backend omits it entirely. Both must yield {} rather than throwing,
 * because the dialog falls back to a humanised tag name.
 */
export function normaliseTagLabels(value: unknown): Record<string, string> {
  let src = value;
  if (typeof src === "string") {
    try {
      src = JSON.parse(src);
    } catch {
      return {};
    }
  }
  if (!src || typeof src !== "object" || Array.isArray(src)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
    if (typeof v === "string" && v) out[k] = v;
  }
  return out;
}

/** Apply toStringArray to every template's merge_fields. */
function normalizeTemplates(items: LetterTemplate[]): LetterTemplate[] {
  return items.map((t) => ({ ...t, merge_fields: toStringArray(t.merge_fields) }));
}

export const letterTemplatesService = {
  list: (params: { letter_type?: HrLetterType; include_inactive?: boolean } = {}) =>
    api
      .get<{ items: LetterTemplate[]; merge_tags: MergeTag[] }>(
        "/org/letter-templates",
        { params },
      )
      .then((r) => ({
        ...r.data,
        items: normalizeTemplates(r.data.items ?? []),
        merge_tags: Array.isArray(r.data.merge_tags) ? r.data.merge_tags : [],
      })),
  create: (data: { letterType: HrLetterType; name: string; body: string }) =>
    api
      .post<{ template: LetterTemplate }>("/org/letter-templates", data)
      .then((r) => normalizeTemplates([r.data.template])[0]),
  update: (
    uuid: UUID,
    data: Partial<{ letterType: HrLetterType; name: string; body: string; isActive: boolean }>,
  ) =>
    api
      .put<{ template: LetterTemplate }>(`/org/letter-templates/${uuid}`, data)
      .then((r) => normalizeTemplates([r.data.template])[0]),
  remove: (uuid: UUID) => api.delete(`/org/letter-templates/${uuid}`).then((r) => r.data),
  /** Render a template against an employee WITHOUT creating anything. */
  preview: (uuid: UUID, data: { employee_uuid: string; values?: Record<string, string> }) =>
    api.post<TemplatePreview>(`/org/letter-templates/${uuid}/preview`, data).then((r) => ({
      ...r.data,
      unresolved: toStringArray(r.data.unresolved),
      unknown: toStringArray(r.data.unknown),
      missing_manual: toStringArray(r.data.missing_manual),
      // A JSON column, so it can arrive as a string. Normalise, and tolerate its
      // absence so an older backend does not break the dialog.
      tag_labels: normaliseTagLabels(r.data.tag_labels),
    })),
};

export const hrLettersService = {
  list: (
    params: {
      page?: number;
      limit?: number;
      employee_uuid?: string;
      letter_type?: HrLetterType;
      status?: HrLetterStatus;
      search?: string;
    } = {},
  ) => api.get<Paginated<HrLetterListItem>>("/org/hr-letters", { params }).then((r) => r.data),
  create: (data: {
    employee_uuid: string;
    template_uuid?: string;
    letter_type: HrLetterType;
    title?: string;
    values?: Record<string, string>;
  }) => api.post<{ letter: HrLetter }>("/org/hr-letters", data).then((r) => r.data.letter),
  /**
   * Issue mints the QR and FREEZES the merged text server-side. Re-supplying
   * values here overrides what the draft stored, which is how a user fixes a
   * draft after seeing the preview.
   */
  issue: (uuid: UUID, values: Record<string, string> = {}) =>
    api
      .post<{ letter: HrLetter }>(`/org/hr-letters/${uuid}/issue`, { values })
      .then((r) => r.data.letter),
  revoke: (uuid: UUID, reason: string) =>
    api
      .post<{ letter: HrLetter }>(`/org/hr-letters/${uuid}/revoke`, { reason })
      .then((r) => r.data.letter),
  /**
   * Return a revoked letter to draft so it can be corrected and issued again.
   *
   * This does NOT re-issue. The letter comes back as a draft with no QR and no
   * issue date, so it must go through the normal issue flow (and its merge-tag
   * values are collected again) before it is attestable.
   */
  revertToDraft: (uuid: UUID) =>
    api.post<{ letter: HrLetter }>(`/org/hr-letters/${uuid}/re-draft`).then((r) => r.data.letter),
  remove: (uuid: UUID) => api.delete(`/org/hr-letters/${uuid}`).then((r) => r.data),
  downloadPdf: (uuid: UUID) =>
    api.get(`/org/hr-letters/${uuid}/pdf`, { responseType: "blob" }).then((r) => r.data as Blob),
};

/** Employee self-service: the signed-in employee's OWN issued letters. */
export const myLettersService = {
  list: (params: { page?: number; limit?: number; letter_type?: HrLetterType } = {}) =>
    api.get<Paginated<HrLetterListItem>>("/my-letters", { params }).then((r) => ({
      ...r.data,
      items: (r.data.items ?? []).map((l) => ({ ...l, payload: l.payload ?? {} })),
    })),
  downloadPdf: (uuid: UUID) =>
    api.get(`/my-letters/${uuid}/pdf`, { responseType: "blob" }).then((r) => r.data as Blob),
};
