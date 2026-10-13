import { api, type Paginated } from "@/lib/api";
import type { UUID } from "./core";

/**
 * Expense claims and reimbursements.
 *
 * `status` is NEVER settable from here. The server owns every transition into
 * `paid` and derives it from the review and the payroll run, so a `status` field
 * on a create or update payload would be a control the user can move whose only
 * effect is to be ignored — which looks like it worked. Same rule the assets
 * service follows, for the same reason.
 *
 * There is no `is_paid` in any of these types either. The column does not exist;
 * `status === "paid"` is the whole flag. A type that offered it would invite a
 * caller to read a field the API never returns.
 */

export type ClaimStatus = "pending" | "approved" | "rejected" | "paid";

/**
 * `payroll` means the reimbursement is carried onto the payslip by the next
 * payroll run for the month the expense was SPENT. `direct` means it is settled by
 * bank transfer.
 *
 * This is not a cosmetic preference the user flips: it decides which mechanism
 * pays, and picking the wrong one means either the money never arrives (payroll
 * mode for a period already closed) or it arrives twice (direct mode on a claim
 * payroll would also have picked up). The server refuses to hand-pay a
 * payroll-mode claim for exactly that reason.
 */
export type PaymentMode = "payroll" | "direct";

export type ExpenseAttachment = {
  uuid: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  category: string | null;
  description: string | null;
  created_at: string;
};

/** The org's policy: what may be claimed, up to how much, and with what proof. */
export type ExpenseCategory = {
  uuid: UUID;
  name: string;
  description: string | null;
  /** `null` means no ceiling, which is NOT the same as a ceiling of zero. */
  max_limit_per_claim: number | null;
  requires_receipt: number | boolean;
  is_active?: number | boolean;
  claim_count?: number;
};

export type ExpenseClaim = {
  uuid: UUID;
  employee_uuid: UUID;
  employee_name: string;
  category_uuid: UUID;
  category_name: string | null;
  amount: number;
  /** YYYY-MM-DD. The day the money was spent, not the day it was claimed. */
  expense_date: string;
  description: string | null;
  status: ClaimStatus;
  payment_mode: PaymentMode;
  rejection_reason: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  /** Non-null once payroll has carried it, so the payslip can be traced back. */
  paid_via_salary_record_uuid: string | null;
  payment_reference: string | null;
  created_at: string;
  receipt_count: number;
  category_requires_receipt: boolean;
  /**
   * Whether this claim could be approved RIGHT NOW.
   *
   * The server computes it (a category that requires a receipt with none attached
   * is not approvable) and the UI disables Approve on it. That flag is what turns
   * "attach a receipt or it will be rejected" from a rule somebody has to know
   * into a state the page shows.
   */
  receipt_satisfied: boolean;
};

export type ExpenseClaimDetail = ExpenseClaim & {
  receipts: ExpenseAttachment[];
  category_max_limit: number | null;
};

/**
 * Status -> badge variant.
 *
 * `paid` is NOT destructive-red. A settled claim is the module working, not an
 * error, and painting success red makes a correctly-reimbursed employee look like
 * a problem. `rejected` is the only genuinely bad state here.
 */
export const CLAIM_STATUS_VARIANT: Record<
  ClaimStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "outline",
  approved: "default",
  // Distinct from `paid` at a glance, and deliberately not red: a rejection is a
  // decision on one claim, and a list of them should read as a worklist.
  rejected: "secondary",
  paid: "secondary",
};

export const CLAIM_STATUSES: ClaimStatus[] = ["pending", "approved", "rejected", "paid"];

/**
 * How far back a claim may be dated.
 *
 * Duplicated from the backend's MAX_BACKDATE_DAYS so the date input can warn
 * before the round trip. The server's value is the authority and this one can
 * drift, which is why the input only *warns* and never blocks on it.
 */
export const MAX_BACKDATE_DAYS = 90;

export const expenseCategoriesService = {
  list: (includeInactive = false) =>
    api
      .get<{ items?: ExpenseCategory[] } | ExpenseCategory[]>("/org/expense-categories", {
        params: includeInactive ? { include_inactive: 1 } : undefined,
      })
      .then((r) => {
        const data = r.data as { items?: ExpenseCategory[] } | ExpenseCategory[];
        const items = Array.isArray(data) ? data : (data.items ?? []);
        // Defensive: this list drives a <Select>, and a non-array would throw
        // during render rather than degrade.
        return Array.isArray(items) ? items : [];
      }),

  create: (data: {
    name: string;
    // null clears it, same as update. The two payloads are built from the same
    // form value, and `null` is what the form produces for a field the user
    // emptied — typing it as `string | undefined` here made one shared payload
    // unassignable to create while assignable to update.
    description?: string | null;
    max_limit_per_claim?: number | null;
    requires_receipt?: boolean;
  }) =>
    api
      .post<{ category: ExpenseCategory }>("/org/expense-categories", data)
      .then((r) => r.data.category),

  /**
   * Edit a category. PARTIAL on purpose — only the keys passed are sent, so a
   * single field can be changed without restating the rest.
   *
   * The checkbox case is why this matters: sending `requires_receipt: false` must
   * not arrive alongside a blank name, which is what a whole-object payload built
   * from a partially-filled form would produce. Keys whose value is `undefined`
   * are dropped by axios, so they simply never reach the server.
   */
  update: (
    uuid: UUID,
    data: {
      name?: string;
      description?: string | null;
      max_limit_per_claim?: number | null;
      requires_receipt?: boolean;
      is_active?: boolean;
    },
  ) =>
    api
      .put<{ category: ExpenseCategory }>(`/org/expense-categories/${uuid}`, data)
      .then((r) => r.data.category),

  /**
   * Remove a category.
   *
   * NAMED `remove` rather than `delete`, and it is NOT a hard delete. The server
   * deactivates: the category leaves the dropdown, while every claim already filed
   * against it — and every payslip already generated from it — keeps resolving to
   * the same name. `claims_preserved` comes back so the UI can say what was kept
   * rather than implying the category and its history were thrown away.
   */
  remove: (uuid: UUID) =>
    api
      .delete<{ retired: boolean; claims_preserved: number }>(
        `/org/expense-categories/${uuid}`,
      )
      .then((r) => r.data),

  /** Bring a removed category back. Reversible is the point of deactivating. */
  restore: (uuid: UUID) =>
    api
      .put<{ category: ExpenseCategory }>(`/org/expense-categories/${uuid}`, {
        is_active: true,
      })
      .then((r) => r.data.category),
};

/**
 * The claim lifecycle, as the two pages actually use it.
 *
 * `review` is the only place a claim's status changes from here, and it takes a
 * decision rather than a status so the client cannot express a transition the
 * server has no route for.
 */
export const expenseClaimsService = {
  list: (
    params: {
      page?: number;
      limit?: number;
      status?: ClaimStatus;
      employee_uuid?: UUID;
      category_uuid?: UUID;
    } = {},
  ) =>
    api
      .get<Paginated<ExpenseClaim>>("/org/expense-claims", {
        params: { ...params, status: params.status || undefined },
      })
      .then((r) => r.data),

  get: (uuid: UUID) =>
    api.get<{ claim: ExpenseClaimDetail }>(`/org/expense-claims/${uuid}`).then((r) => r.data.claim),

  /**
   * There is deliberately NO `create` on this object.
   *
   * Every method here sits behind the same server gate, which makes an org_admin
   * unconditionally `approve_expenses`. A method that filed a claim for a named
   * employee would therefore give the one account that can approve any
   * reimbursement the power to originate one and approve it in the same breath.
   * Staff shape the policy and adjudicate it; employees originate it, through
   * myExpensesService.create below, which cannot name an employee at all.
   *
   * POST /org/expense-claims is not registered server-side either. If you are
   * reading this after adding a "New claim" button to the review queue, the
   * endpoint you are calling returns 404 - by design.
   */

  /**
   * Approve or reject.
   *
   * `rejection_reason` is required by the server for a rejection, and the type
   * makes it required in the rejecting branch too rather than optional with a
   * runtime check further down — the error is otherwise only discovered after a
   * round trip.
   */
  review: (
    uuid: UUID,
    data:
      | { decision: "approved"; payment_mode?: PaymentMode }
      | { decision: "rejected"; rejection_reason: string; payment_mode?: PaymentMode },
  ) =>
    api
      .post<{ claim: ExpenseClaim }>(`/org/expense-claims/${uuid}/review`, data)
      .then((r) => r.data.claim),

  /** Settle a `direct` claim. Refused by the server for a payroll-mode claim. */
  pay: (uuid: UUID, paymentReference?: string) =>
    api
      .post<{ claim: ExpenseClaim }>(`/org/expense-claims/${uuid}/pay`, {
        payment_reference: paymentReference || undefined,
      })
      .then((r) => r.data.claim),

  /**
   * Settle several direct claims at once.
   *
   * NO CALL SITE TODAY — the multi-select settle flow this was written for was never
   * built. It is kept because expensesClient.test.ts pins the response contract:
   * the server returns BOTH lists, and partial success is the normal case (one claim
   * may already be settled, or routed through payroll), so a caller that reads only
   * `paid` would believe a half-finished batch completed. That contract has to be
   * enforced where it is defined, so the client stays until the UI exists.
   *
   * The backend endpoint POST /org/expense-claims/bulk-pay is fully implemented.
   */
  bulkPay: (claimUuids: UUID[], paymentReference?: string) =>
    api
      .post<{ paid: UUID[]; refused: { uuid: string; reason: string }[] }>(
        "/org/expense-claims/bulk-pay",
        { claim_uuids: claimUuids, payment_reference: paymentReference || undefined },
      )
      .then((r) => r.data),

  // ---- receipts ------------------------------------------------------------
  // Files are uploaded as multipart and stored as attachment entities with
  // entity_type='expense_claim', never as a path column on the claim. See the
  // backend's attachments.service.js.
  uploadReceipts: (uuid: UUID, files: File[], description?: string) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    if (description) form.append("description", description);
    return api
      .post<{ items: ExpenseAttachment[] }>(`/org/expense-claims/${uuid}/receipts`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data.items ?? []);
  },

  removeAttachment: (attachmentUuid: UUID) =>
    api.delete(`/org/expense-attachments/${attachmentUuid}`).then((r) => r.data),

  /**
   * Fetch a receipt as a Blob, through axios so the auth interceptor runs.
   *
   * A plain `<a href="/org/expense-attachments/...">` would NOT work: the endpoint
   * is authenticated, a new tab carries no Authorization header, and the result is
   * a 401 page rendered where a receipt should be. The caller owns the resulting
   * object URL and must revoke it — see useAttachmentUrl.
   */
  downloadAttachment: (attachmentUuid: UUID) =>
    api
      .get(`/org/expense-attachments/${attachmentUuid}/download`, { responseType: "blob" })
      .then((r) => r.data as Blob),
};

/**
 * Employee self-service: my own claims.
 *
 * A SEPARATE object from expenseClaimsService, and `create` here has no
 * employee_uuid parameter at all. That absence is the feature: the server derives
 * the employee from the session, so there is no field a caller could change to
 * file a reimbursement against a colleague and have the company pay it.
 */
export const myExpensesService = {
  list: (params: { status?: ClaimStatus } = {}) =>
    api
      .get<Paginated<ExpenseClaim>>("/my/expenses", {
        params: { status: params.status || undefined },
      })
      .then((r) => r.data),

  /**
   * The categories I may file against, through MY OWN route.
   *
   * NOT `expenseCategoriesService.list`. That one calls /org/expense-categories,
   * which is gated on org_admin/sub_admin PLUS approve_expenses, so an employee
   * got a 403 — and because a rejected query leaves `data` undefined, the claim
   * form fell through to its empty state and told the employee "No categories
   * found. Create a new category first." A message that is both false (categories
   * exist) and unactionable (they cannot create one).
   *
   * Read-only by design: an employee sees what they may claim and cannot manage
   * the category list itself.
   */
  categories: () =>
    api
      .get<{ items?: ExpenseCategory[] }>("/my/expenses/categories")
      .then((r) => (Array.isArray(r.data.items) ? r.data.items : [])),

  get: (uuid: UUID) =>
    api.get<{ claim: ExpenseClaimDetail }>(`/my/expenses/${uuid}`).then((r) => r.data.claim),

  /**
   * File one of MY claims.
   *
   * `auto_approve` is a REQUEST, not an instruction — the server resolves the
   * approve_expenses permission from the session, not from this field, so a
   * client that sends it without the authority gets a pending claim rather than an
   * approved one. The response carries `auto_approve_refusal` when that happens,
   * which the form shows as a warning instead of an error: the claim itself was
   * filed either way.
   */
  create: (data: {
    category_uuid: UUID;
    amount: number;
    expense_date: string;
    description?: string;
    payment_mode?: PaymentMode;
    auto_approve?: boolean;
  }) =>
    api
      .post<{ claim: ExpenseClaim & { auto_approve_refusal?: string | null } }>("/my/expenses", data)
      .then((r) => r.data.claim),

  /**
   * Add receipts to one of MY claims.
   *
   * Deliberately NOT expenseClaimsService.uploadReceipts. That posts to the STAFF
   * route, which is org-gated, so an employee using the ESS portal would get a 403
   * on the one action the portal exists to let them do — and the failure would look
   * like a broken page rather than a missing permission. These are separate
   * self-service routes on the server, each of which re-proves the claim belongs
   * to the caller before touching anything.
   */
  uploadReceipts: (uuid: UUID, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return api
      .post<{ items: ExpenseAttachment[] }>(`/my/expenses/${uuid}/receipts`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data.items ?? []);
  },

  removeAttachment: (attachmentUuid: UUID) =>
    api.delete(`/my/expense-attachments/${attachmentUuid}`).then((r) => r.data),

  /** Blob, via axios so the auth interceptor runs. The caller must revoke the URL. */
  downloadAttachment: (attachmentUuid: UUID) =>
    api
      .get(`/my/expense-attachments/${attachmentUuid}/download`, { responseType: "blob" })
      .then((r) => r.data as Blob),
};
