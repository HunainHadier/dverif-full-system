import { api, type Paginated } from "@/lib/api";
import type { UUID } from "./core";

/**
 * Offboarding: an employee leaving, what they still hold, and what they are owed.
 *
 * Mirrors the backend's three tables. The types here are deliberately faithful to
 * the wire shape rather than prettier - every field is snake_case because that is
 * what the API sends, and a renamed field that silently reads undefined is the
 * same class of bug the backend hit when a line's basis came back camelCase.
 *
 * Money arrives as DECIMAL strings. `number | string` on the amount fields
 * reflects that honestly, so a formatter has to convert rather than discovering
 * it at runtime on the first payslip.
 */

export type ExitStatus = "pending" | "approved" | "rejected" | "completed";
export type ExitRequestType = "resignation" | "termination";
export type SettlementStatus = "draft" | "processed" | "paid";
export type ClearanceDepartment = "IT" | "Finance" | "Assets" | "HR";
export type ChecklistStatus = "pending" | "cleared";

export type ChecklistItem = {
  uuid: UUID;
  department: ClearanceDepartment;
  task_name: string;
  status: ChecklistStatus;
  cleared_by_uuid: string | null;
  cleared_at: string | null;
  notes: string | null;
};

/**
 * Clearance progress, per department and overall.
 *
 * A count rather than a fraction or a percentage. "7 of 9" is answerable by
 * whoever is being asked "is this done yet"; 0.78 is not.
 */
export type ChecklistSummary = {
  total: number;
  cleared: number;
  pending: number;
  complete: boolean;
  byDepartment: Record<string, { pending: number; cleared: number }>;
};

export type SettlementStub = {
  uuid: UUID;
  status: SettlementStatus;
  net_fnf_amount: number | string;
  leave_encashment_amount: number | string;
  asset_deductions: number | string;
  unreturned_asset_count: number;
};

export type ExitRequestDetail = {
  uuid: UUID;
  organization_id: number;
  employee_uuid: UUID;
  employee_name: string;
  designation: string | null;
  request_type: ExitRequestType;
  notice_period_days: number;
  /** Already normalised to YYYY-MM-DD by the API, never a Date. */
  last_working_day: string;
  reason: string | null;
  status: ExitStatus;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  completed_at: string | null;
  hr_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  checklist: ChecklistItem[];
  checklistSummary: ChecklistSummary;
  settlement: SettlementStub | null;
};

/** One row in the dashboard table. Counts pre-computed server-side. */
export type ExitRequestListRow = {
  uuid: UUID;
  employee_uuid: UUID;
  employee_name: string;
  designation: string | null;
  request_type: ExitRequestType;
  notice_period_days: number;
  last_working_day: string;
  status: ExitStatus;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  completed_at: string | null;
  clearance_pending: number;
  clearance_total: number;
  /** Company assets still in this person's custody. The thing that blocks payment. */
  assets_outstanding: number;
  settlement_status: SettlementStatus | null;
  net_fnf_amount: number | string | null;
};

export type OutstandingAsset = {
  asset_uuid: UUID;
  asset_tag: string;
  name: string;
  category_name: string | null;
  serial_number: string | null;
  asset_status: string;
  purchase_cost: number | string | null;
  assigned_at: string;
  assignment_uuid: UUID;
};

export type OutstandingAssets = {
  items: OutstandingAsset[];
  count: number;
  /** Sum of purchase_cost. Recovery value, NOT depreciation. */
  exposure: number;
  /** Assets held with no recorded cost: still outstanding, but worth nothing to recover. */
  uncosted: number;
};

export type LeaveEncashmentRow = {
  leave_type: string;
  is_paid: string;
  allocated_days: number;
  used_days: number;
  remaining_days: number;
  /** Zero for an unpaid type: there is no entitlement to be paid in cash for it. */
  encashable_days: number;
};

export type SettlementCalc = {
  exit_request_uuid: UUID;
  employee_uuid: UUID;
  employee_name: string;
  last_working_day: string;
  basic_salary: number | string;
  working_days_in_month: number;
  per_day_rate: number | string;
  leave: { rows: LeaveEncashmentRow[]; encashable_days: number; amount: number };
  notice: {
    notice_period_days: number;
    notice_days_served: number;
    shortfall_days: number;
    recovery: number;
    /** Negative when it reduces the payout. */
    adjustment: number;
    notice_given_on: string;
  };
  assets: OutstandingAssets & {
    /** The amount actually taken out of the settlement. */
    applied: number;
    /** True when the deduction was capped because the settlement could not cover it. */
    capped: boolean;
    /** Exposure the cap could not reach. A debt, not a write-off. */
    withheld_amount: number;
  };
  gross: number;
  net_fnf_amount: number;
};

export type ClearanceQueueRow = {
  exit_request_uuid: UUID;
  employee_uuid: UUID;
  employee_name: string;
  designation: string | null;
  status: ExitStatus;
  request_type: ExitRequestType;
  last_working_day: string;
  department: ClearanceDepartment;
  pending_count: number;
  total_count: number;
  assets_outstanding: number;
};

/** The employee's own view. `null` means they have no exit request. */
export type MyExit = {
  /**
   * Whether this employee is still on the roster.
   *
   * The server's answer, not something the page infers from the exit status,
   * because an ex-employee with no exit record exists - someone who left before
   * this module, or whose status HR set by hand - and the form has to stay hidden
   * for them too. Keying only on the exit status rendered a resignation form for
   * people who had already left.
   */
  on_roster: boolean;
  employee_status: string | null;
  exit_request: {
    uuid: UUID;
    status: ExitStatus;
    request_type: ExitRequestType;
    notice_period_days: number;
    last_working_day: string;
    reason: string | null;
    decision_notes: string | null;
    created_at: string;
    decided_at: string | null;
    completed_at: string | null;
  } | null;
  checklist: ChecklistItem[];
  checklistSummary: ChecklistSummary | null;
  /**
   * The employee's own figures. Deliberately omits the asset deduction
   * arithmetic - showing someone a number partly derived from the price of the
   * laptop they are holding starts an argument HR cannot settle. The backend
   * withholds it, so it is not typed here either.
   */
  settlement: {
    status: SettlementStatus;
    leave_encashment_days: number;
    leave_encashment_amount: number | string;
    net_fnf_amount: number | string;
  } | null;
  outstanding_assets: number;
};

export const offboardingService = {
  // ---- staff ----
  list: (params: { page?: number; limit?: number; status?: string; search?: string } = {}) =>
    api
      .get<Paginated<ExitRequestListRow>>("/org/offboarding/exit-requests", { params })
      .then((r) => r.data),

  detail: (uuid: UUID) =>
    api
      .get<{ exit_request: ExitRequestDetail }>(`/org/offboarding/exit-requests/${uuid}`)
      .then((r) => r.data.exit_request),

  create: (data: {
    employee_uuid: UUID;
    request_type: ExitRequestType;
    notice_period_days?: number;
    last_working_day: string;
    reason?: string;
    hr_notes?: string;
  }) =>
    api
      .post<{ exit_request: ExitRequestDetail }>("/org/offboarding/exit-requests", data)
      .then((r) => r.data.exit_request),

  /**
   * Approve or reject. The notice period is settable here because the submitted
   * value is the employee's guess and the approved value is the contract - which
   * is also the figure any shortfall is recovered against.
   */
  review: (
    uuid: UUID,
    data: {
      decision: "approved" | "rejected";
      notice_period_days?: number;
      last_working_day?: string;
      decision_notes?: string;
    },
  ) =>
    api
      .post<{ exit_request: ExitRequestDetail }>(
        `/org/offboarding/exit-requests/${uuid}/review`,
        data,
      )
      .then((r) => r.data.exit_request),

  clearTask: (uuid: UUID, checklistUuid: UUID, notes?: string) =>
    api
      .post<{ exit_request: ExitRequestDetail }>(
        `/org/offboarding/exit-requests/${uuid}/checklist/${checklistUuid}`,
        { notes },
      )
      .then((r) => r.data.exit_request),

  outstandingAssets: (uuid: UUID) =>
    api.get<OutstandingAssets>(`/org/offboarding/exit-requests/${uuid}/assets`).then((r) => r.data),

  /** Preview. Writes nothing - the figures are re-derived on every save anyway. */
  previewSettlement: (uuid: UUID) =>
    api
      .get<SettlementCalc>(`/org/offboarding/exit-requests/${uuid}/settlement`)
      .then((r) => r.data),

  draftSettlement: (uuid: UUID, notes?: string) =>
    api
      .post<{ settlement: SettlementCalc & { uuid: UUID; status: SettlementStatus } }>(
        `/org/offboarding/exit-requests/${uuid}/settlement`,
        { notes },
      )
      .then((r) => r.data.settlement),

  advanceSettlement: (uuid: UUID, target: "processed" | "paid", paymentReference?: string) =>
    api
      .post<{ settlement: Record<string, unknown> }>(
        `/org/offboarding/exit-requests/${uuid}/settlement/advance`,
        { target, payment_reference: paymentReference },
      )
      .then((r) => r.data.settlement),

  complete: (uuid: UUID, hrNotes?: string) =>
    api
      .post<{ exit_request: ExitRequestDetail }>(
        `/org/offboarding/exit-requests/${uuid}/complete`,
        {
          hr_notes: hrNotes,
        },
      )
      .then((r) => r.data.exit_request),

  clearanceQueue: () =>
    api
      .get<{ items: ClearanceQueueRow[]; count: number }>("/org/offboarding/clearances")
      .then((r) => r.data),
};

/**
 * The employee's own resignation.
 *
 * Separate from the staff service because the two are not the same permission:
 * these are reached with authUser and no role check, and `employee_uuid` is NOT
 * accepted - the backend derives the employee from the session, so a caller
 * cannot file a resignation for a colleague or, worse, a termination for
 * themselves.
 */
export const myResignationService = {
  get: () => api.get<MyExit>("/my/resignation").then((r) => r.data),

  submit: (data: { last_working_day: string; reason?: string }) =>
    api
      .post<{ exit_request: ExitRequestDetail }>("/my/resignation", data)
      .then((r) => r.data.exit_request),
};
