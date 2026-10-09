/**
 * Shared types, constants and pure helpers.
 *
 * Every other module in this folder depends on this one, and it depends on nothing
 * but the axios instance. Keeping it separate means a type shared by billing and
 * hr has exactly one declaration site.
 *
 * Do NOT put service objects here.
 */

import { api, type Paginated } from "@/lib/api";
// Types only — this keeps the module's runtime dependency on axios alone, which is
// what its header comment promises. featureKeys has no imports at all, so there is
// nothing to drag in transitively.
import type { FeatureAccessMap, FeatureKey } from "@/lib/featureKeys";

export type UUID = string;

/**
 * A document type in the system-admin catalogue.
 *
 * `schema_key` is the important one: it names the canonical field schema the OCR
 * service extracts with. A type with no schema (or `generic`) still works — it
 * extracts name + CNIC — but a type pointed at, say, `cnic` also gets DOB, and
 * one pointed at `offer_letter` gets designation and joining date.
 */

export type DocumentType = {
  id: number;
  name: string;
  /** The label normalized the same way the OCR service normalizes it. */
  label_key: string;
  schema_key: string;
  is_active: number;
  sort_order: number;
  description: string | null;
  created_at?: string;
  updated_at?: string;
};

/**
 * What the OCR service reports about itself, for the "is it in step?" indicator
 * and for the schema key input.
 *
 * `schema_keys` is the flat list of keys the service will actually accept. It is
 * read from the service at runtime rather than kept in this file: the registry
 * lives in the document service, and a copy here would have to be updated by
 * hand in a second repository and would silently offer keys that no longer
 * exist. The `schemas` map is the detail behind each key.
 */

export type DocumentTypeSyncStatus = {
  reachable: boolean;
  error?: string;
  kind?: string;
  catalogue_count?: number;
  auto_match_ineligible?: string[];
  /** Flat, sorted list of valid `schema_key` values. Empty when unreachable. */
  schema_keys?: string[];
  schemas?: Record<string, { fields: string[]; required: string[]; auto_match_eligible: boolean }>;
  generic?: { fields: string[]; required: string[]; auto_match_eligible: boolean };
};

export type Organization = {
  uuid: UUID;
  name: string;
  verified: "yes" | "no";
  organization_type: string;
  business_email?: string | null;
  allowed_ip_addresses?: string[] | null;
  logo?: string | null;
  subscription_status?: "active" | "expired" | "none";
  subscription_start?: string | null;
  subscription_expiry?: string | null;
  subscription_plan_id?: number | null;
  subscription_plan_name?: string | null;
  users_count?: number;
  employees_count?: number;
  requests_count?: number;
  admin_name?: string | null;
  admin_email?: string | null;
  created_at?: string;
};

/**
 * The feature_access shape as the API returns it.
 *
 * Derived from FeatureKey rather than restated, because it WAS a sixth copy of the
 * permission list and the API type is the one most likely to drift: the server adds
 * a key, this type is not updated, and the client quietly loses the ability to read
 * the permission an org admin actually granted.
 */
export type FeatureAccess = FeatureAccessMap;

export type FeatureAccessKey = FeatureKey;

export type UserRecord = {
  uuid: UUID;
  full_name: string;
  email: string;
  phone?: string | null;
  cnic?: string | null;
  status: "active" | "inactive";
  org_role?: "employee" | "org_admin" | "sub_admin";
  feature_access?: FeatureAccess | null;
  profile_image?: string | null;
  is_verified?: "yes" | "no";
  created_at?: string;
  organization_uuid?: string | null;
  organization_name?: string | null;
  organization_logo?: string | null;
  invitation_pending?: boolean;
};

export type MatchStatus =
  "not_attempted" | "auto_matched" | "manual_review" | "no_reference_found" | string;

/**
 * Lifecycle of a verification request.
 *
 * `auto_verified` is deliberately its own value rather than a flag folded into
 * `verified`: the requester needs to know that nobody reviewed their document,
 * and that is a statement about the outcome, not about the request. The backend
 * counterpart is `verification_requests.status`.
 */

export type RequestStatus = "under_review" | "verified" | "auto_verified" | "unverified" | string;

/** The statuses that mean "successfully verified". Mirrors the backend constant. */

export const VERIFIED_REQUEST_STATUSES: RequestStatus[] = ["verified", "auto_verified"];

/**
 * Whether a request reached a successful verification.
 *
 * Use this instead of `status === "verified"`. An auto-verified request has a
 * certificate, a QR that resolves publicly and a document the viewer will open,
 * so any check that treats only `verified` as success silently hides all of
 * that — which is how an auto-approved request ends up looking unverifiable on
 * the very page that reports the approval.
 */

export function isVerifiedRequestStatus(status?: string | null): boolean {
  return !!status && VERIFIED_REQUEST_STATUSES.includes(status);
}

export type VerificationRequest = {
  uuid: UUID;
  document_type: string;
  issuing_organization_uuid?: string | null;
  issuing_org_name?: string | null;
  unmatched_org_uuid?: string | null;
  unmatched_org_name?: string | null;
  submission_remarks?: string | null;
  document_owner_cnic?: string | null;
  document_owner_name?: string | null;
  has_prior_verification?: boolean;
  prior_verified_at?: string | null;
  verification_remarks?: string | null;
  /**
   * `auto_verified` is a terminal success like `verified` — it has a certificate
   * and a working QR — but the system approved it and no human ever saw the
   * document. Anything asking "did this verify?" must accept both; see
   * `isVerifiedRequestStatus` below.
   */
  status: RequestStatus;
  document_path?: string;
  document_format?: string;
  submitted_at: string;
  verified_at?: string | null;
  organization_conserned_for_future?: "yes" | "no";
  verification_method?: string;
  locked_by?: number | null;
  locked_at?: string | null;
  locked_by_uuid?: string | null;
  locked_by_name?: string | null;
  verified_by?: number | null;
  verified_by_uuid?: string | null;
  verified_by_name?: string | null;
  verified_by_email?: string | null;
  requester_uuid?: string;
  requester_name?: string;
  requester_email?: string;
  requester_organization_uuid?: string | null;
  requester_organization?: string | null;
  requester_org_logo?: string | null;
  issuing_org_logo?: string | null;
  qr_token?: string | null;
  /**
   * The public verification link, built server-side by the same helper that
   * stamps the downloadable certificate PDF. Present only when the request
   * carries a QR token.
   *
   * Always render this rather than assembling a URL from a base: the frontend
   * used to keep its own VITE_PUBLIC_BASE_URL copy, which drifted from the
   * backend's QR_VERIFY_BASE_URL and sent people to a different host than the
   * printed certificate did.
   */
  verify_url?: string | null;
  sla_reminder_sent_at?: string | null;
  sla_flagged_at?: string | null;
  match_status?: MatchStatus | null;
  match_confidence?: number | string | null;
  match_mismatch_risk?: boolean | null;
  linked_person_id?: number | null;
  matched_employee_document_id?: number | null;
  matched_document_uuid?: string | null;
  matched_document_name?: string | null;
  matched_document_path?: string | null;
  matched_document_type?: string | null;
  matched_employee_name?: string | null;
  auto_verified?: boolean;
  doc_verification_count?: number | string | null;
  /**
   * Outcome of the automated document check, as recorded by the backend.
   * - "passed": structural checks (parse / truncation / CRC / type agreement) were clean.
   * - "flagged": a HEURISTIC quality check fired (crop detection, darkness /
   *   low-contrast). Tuning-sensitive and possibly a false positive, so the
   *   request was still created rather than blocked.
   * - "unvalidated": the document service was unreachable, so nothing was
   *   actually checked.
   *
   * Not surfaced in the UI — the reviewer is expected to judge the file
   * directly — but kept on the row and exposed here for API consumers and
   * support queries.
   */
  document_validation_status?: "passed" | "flagged" | "unvalidated" | null;
  /** The validator's own message, present when status is "flagged". */
  document_validation_reason?: string | null;
};

/** One ledger entry: a single organization's verification of a person's document. */

export type DocumentVerificationRecord = {
  id: number;
  uuid: UUID;
  document_type?: string | null;
  document_hash?: string | null;
  verified_at?: string | null;
  status: "verified" | "unverified";
  cross_check_status?: "not_checked" | "matched" | "mismatched" | null;
  verified_by_organization_uuid?: string | null;
  verified_by_organization?: string | null;
  verified_by_organization_logo?: string | null;
  verification_request_uuid?: string | null;
  verification_method?: string | null;
};

/** Full cross-organization verification history for one document. */

export type AutoVerifiedHistory = {
  person_uuid?: string | null;
  document_type?: string | null;
  document_owner_name?: string | null;
  total_verifications: number;
  history: DocumentVerificationRecord[];
};

export type UnmatchedOrganization = {
  uuid: UUID;
  name: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  status: "pending" | "contacted" | "converted" | "ignored";
  request_count: number;
  created_at: string;
  assigned_organization?: { uuid: UUID; name: string } | null;
};

export type UnmatchedOrgDetail = {
  organization: UnmatchedOrganization;
  requests: Array<{
    uuid: UUID;
    document_type: string;
    document_format?: string;
    document_path?: string;
    status: RequestStatus;
    submitted_at: string;
    verified_at?: string | null;
    submission_remarks?: string | null;
    verification_remarks?: string | null;
    verification_method?: string;
    locked_by?: number | null;
    locked_at?: string | null;
    locked_by_name?: string | null;
    requester_name?: string;
    requester_email?: string;
    requester_org_uuid?: string | null;
  }>;
};

export type AdminUserRecord = UserRecord;

/**
 * Employee lifecycle state.
 *
 * `record_type` used to be a second column saying roster-vs-ex-employee; it was
 * merged into this one, so `status` now answers both questions at once:
 *
 *   current_employee — on staff, normal case
 *   ex_employee      — left, kept only as a verification reference
 *   active           — deactivated: still on the roster, but refused login by
 *                      the API's auth guards. Only settable when EDITING; there
 *                      is nothing to deactivate at creation time.
 */

export type EmployeeStatus = "current_employee" | "ex_employee" | "active" | "inactive";

/** The statuses that mean "on the current roster", for client-side filtering. */

export const CURRENT_EMPLOYEE_STATUSES: EmployeeStatus[] = ["current_employee", "active"];

/** Whether this employee is still on the current roster (not an ex-employee). */

export function isCurrentEmployee(status?: string | null): boolean {
  return !!status && CURRENT_EMPLOYEE_STATUSES.includes(status as EmployeeStatus);
}

export type EmployeeRecord = {
  uuid: UUID;
  organization_id: number;
  organization_uuid?: UUID | null;
  organization_name?: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  cnic: string;
  employee_code?: string | null;
  designation: string | null;
  department: string | null;
  status: EmployeeStatus;
  is_platform_user: "yes" | "no";
  joining_date?: string | null;
  employment_type?: "full_time" | "part_time" | "contract" | "temporary" | "intern" | null;
  work_location?: string | null;
  reporting_manager_uuid?: UUID | null;
  reporting_manager_name?: string | null;
  emergency_contact?: string | null;
  document_count?: number;
  current_salary?: string | number | null;
  linked_user_uuid?: UUID | null;
  linked_user_email?: string | null;
  linked_user_profile_image?: string | null;
  added_by_uuid?: UUID | null;
  added_by_name?: string | null;
  promoted_by_uuid?: UUID | null;
  promoted_by_name?: string | null;
  promoted_at?: string | null;
  created_at: string;
  linked_user_status?: "active" | "inactive" | null;
  linked_user_role?: "employee" | "org_admin" | "sub_admin" | null;
  feature_access?: string | FeatureAccess | null;
  invite_sent_at?: string | null;
  invite_expires_at?: string | null;
  invite_used_at?: string | null;
  invite_delivery_status?: "pending" | "sent" | "failed" | null;
  invite_delivery_error?: string | null;
};

export type EmployeeDocument = {
  uuid: UUID;
  employee_uuid: UUID;
  document_type: string | null;
  file_name: string;
  file_path: string;
  file_size?: number | null;
  uploaded_at?: string | null;
  created_at: string;
  document_hash?: string | null;
  document_extracted_name?: string | null;
  document_extracted_cnic_hash?: string | null;
  match_status?: string | null;
};

export type ManagedOption = { uuid: UUID; name: string };

export type OrgUserRecord = {
  uuid: UUID;
  full_name: string;
  email: string;
  phone?: string | null;
  cnic?: string | null;
  status: "active" | "inactive";
  org_role: "employee" | "org_admin" | "sub_admin";
  feature_access?: FeatureAccess | null;
  created_at?: string;
  employee_uuid?: UUID | null;
  designation?: string | null;
  department?: string | null;
};

export type OrgAdminUserRecord = {
  uuid: UUID;
  full_name: string;
  email: string;
  phone?: string | null;
  cnic?: string | null;
  status: "active" | "inactive";
  org_role: "org_admin" | "sub_admin";
  feature_access?: FeatureAccess | null;
  created_at?: string;
  /**
   * 'no' until the invitee sets a password, 'yes' afterwards. The org sub-admin
   * list is only allowed to offer Cancel Invitation / Remove Permanently while
   * this is 'no' — same rule the platform /admin/users list follows.
   */
  is_verified?: "yes" | "no";
  /** True while an unused invite token exists, i.e. a link that still works. */
  invitation_pending?: boolean;
};

export type Payment = {
  uuid: UUID;
  amount: number;
  payment_method: string;
  transaction_reference: string;
  purpose: string;
  paid_at?: string;
  created_at?: string;
  user_uuid?: string;
  full_name?: string;
  email?: string;
};

export type PlanSummary = {
  /** "free" | "paid" — derived from the plan's is_free flag, never its name. */
  code: string;
  label: string | null;
  is_free: boolean;
  plan_name: string | null;
  plan_uuid: string | null;
  expires_at: string | null;
  has_expiry: boolean;
  is_expired: boolean;
  is_active: boolean;
  status: string;
};

export type PlanFeature = {
  text: string;
  highlight?: boolean;
};

export type OrgSubscription = {
  status: "active" | "expired" | "none" | "pending_payment";
  plan: "monthly" | "yearly" | null;
  plan_name: string | null;
  /**
   * Whether the current plan is the Free plan. Every organization is always on
   * a real plan (Free by default), and Free is identified by this flag alone --
   * never by a name match or a zero price. A Free plan has no expiry, so
   * `expiry === null` means "indefinite" for it rather than "expired".
   */
  is_free?: number | boolean | null;
  plan_uuid?: string | null;
  monthly_price: number | null;
  daily_request_quota: number | null;
  description?: string | null;
  features?: PlanFeature[];
  module_flags?: ModuleFlags | null;
  expiry: string | null;
  start: string | null;
  /**
   * A SCHEDULED plan change: buying the same plan again (a renewal) or a
   * lower-tier plan while the current period is still running parks the new plan
   * here instead of switching immediately. The change is applied automatically
   * when `pending_plan_effective_at` passes, and can be cancelled with a refund
   * before then.
   *
   * `pending_plan_name` equal to `plan_name` means it is a RENEWAL rather than a
   * downgrade — the same one mechanism, two meanings, distinguished by whether the
   * plan actually changes.
   */
  pending_plan_id?: number | null;
  pending_plan_name?: string | null;
  pending_plan_daily_request_quota?: number | null;
  pending_plan_monthly_price?: number | null;
  pending_plan_effective_at?: string | null;
} | null;

export type QuotaStatus = {
  date: string;
  free_daily_requests: number;
  plan_quota: number;
  total_allowance: number;
  requests_used: number;
  total_requests: number;
  requests_remaining: number;
  plan: {
    uuid: string | null;
    name: string | null;
    daily_request_quota: number;
  } | null;
};

export type CustomPlanRequest = {
  uuid: UUID;
  message: string | null;
  requested_quota: number | null;
  requested_price: number | null;
  status: "pending" | "approved" | "denied";
  approved_daily_quota: number | null;
  approved_price: number | null;
  created_at?: string;
  decided_at?: string | null;
  decided_by?: string | null;
  requested_by_name?: string | null;
  requested_by_email?: string | null;
  organization_uuid?: string | null;
  organization_name?: string | null;
  organization_id?: number | null;
  /**
   * The plan this approval created, and the edge that makes it payable. NULL
   * means the System Admin approved the terms but no plan could be linked, in
   * which case there is nothing to pay for and the UI must not offer to pay.
   */
  approved_plan_id?: number | null;
  approved_plan_uuid?: UUID | null;
  approved_plan_name?: string | null;
  approved_plan_monthly_price?: number | null;
};

export type SelfSubscriptionRequest = {
  uuid: UUID;
  amount: number | null;
  status: "pending" | "confirmed" | "cancelled";
  created_at?: string;
  decided_at?: string | null;
  decided_by?: string | null;
  organization_uuid?: string | null;
  organization_name?: string | null;
  subscription_status?: string | null;
  plan_uuid?: string | null;
  plan_name?: string | null;
  monthly_price?: number | null;
  daily_request_quota?: number | null;
  billing_period?: string | null;
  requested_by_name?: string | null;
  requested_by_email?: string | null;
  organization_id?: number | null;
};

/**
 * Every org-scoped HR module a plan's `module_flags` can include or exclude.
 *
 * Must stay in lockstep with MODULE_FEATURE_KEYS in the backend
 * (src/utils/moduleFlags.js), which is what actually enforces access — this type
 * is the client-side mirror. The backend sends `module` and `module_label` in its
 * UPGRADE_REQUIRED 403, so the runtime values come from the API; this type only
 * has to cover the keys the UI can ask about.
 */
export type ModuleFlags = {
  // --- Pre-existing core HR ---
  employee_management: boolean;
  attendance_management: boolean;
  user_management: boolean;
  leave_management: boolean;
  payroll_management: boolean;

  // --- Workforce lifecycle ---
  manpower_management: boolean;
  recruitment_management: boolean;
  onboarding_management: boolean;
  separation_management: boolean;
  training_management: boolean;

  // --- Performance & variable pay ---
  performance_management: boolean;
  piece_work_management: boolean;

  // --- Money ops ---
  expense_management: boolean;
  travel_management: boolean;
  asset_management: boolean;
  helpdesk_management: boolean;

  // --- Automation & documents ---
  scheduled_reports: boolean;
  hr_letters_management: boolean;
};

/**
 * Machine-readable error codes the API returns. The two that matter here both
 * arrive as a 403 but need completely different UI:
 *
 *   SUBSCRIPTION_INACTIVE - no valid subscription at all. Rare: every org is
 *                           always on a plan (Free by default). Reserved for a
 *                           corrupted or lapsed state.
 *   UPGRADE_REQUIRED     - the subscription is valid, this plan just does not
 *                           include the module. Render an "upgrade" prompt that
 *                           can open the plan chooser, NOT a dead-subscription
 *                           banner.
 */

export type ApiErrorCode = "SUBSCRIPTION_INACTIVE" | "UPGRADE_REQUIRED" | string;

/** A 403 body carrying a code plus module context. */

export type ApiErrorBody = {
  success: false;
  message: string;
  code?: ApiErrorCode;
  module?: keyof ModuleFlags;
  module_label?: string;
  can_retry?: boolean;
};

/**
 * True when this 403 means "your plan does not include X" rather than "your
 * subscription is broken". Lets any page branch on the real cause instead of
 * showing the same generic banner for both.
 */

export function isUpgradeRequiredError(e: unknown): boolean {
  const body = (e as { response?: { data?: ApiErrorBody } })?.response?.data;
  return body?.code === "UPGRADE_REQUIRED";
}

/** The module an UPGRADE_REQUIRED error refers to, if any. */

export function upgradeRequiredModule(e: unknown): keyof ModuleFlags | null {
  const body = (e as { response?: { data?: ApiErrorBody } })?.response?.data;
  if (body?.code !== "UPGRADE_REQUIRED") return null;
  return (body.module as keyof ModuleFlags) ?? null;
}

/**
 * The org-scoped HR modules (+ human labels) that a plan's module_flags
 * toggles. Order matters: it drives both the create/edit modal and the list
 * indicator.
 *
 * The labels here are a fallback only. When the API refuses a request it
 * returns `module_label` with the UPGRADE_REQUIRED 403, and the client should
 * prefer that — it is generated from the backend's own MODULE_LABELS and is
 * therefore guaranteed to name whatever version of the backend is actually
 * running. These strings exist for the plan-editor checkboxes, where no request
 * has been made yet.
 */

export const MODULE_FEATURES: { key: keyof ModuleFlags; label: string }[] = [
  { key: "employee_management", label: "Employee Management" },
  { key: "attendance_management", label: "Attendance Management" },
  { key: "user_management", label: "User Management" },
  { key: "leave_management", label: "Leave Management" },
  { key: "payroll_management", label: "Payroll Management" },
  { key: "manpower_management", label: "Manpower Management" },
  { key: "recruitment_management", label: "Recruitment Management" },
  { key: "onboarding_management", label: "Onboarding Management" },
  { key: "separation_management", label: "Separation Management" },
  { key: "training_management", label: "Training Management" },
  { key: "performance_management", label: "Performance Management" },
  { key: "piece_work_management", label: "Piece Work Management" },
  { key: "expense_management", label: "Expense Management" },
  { key: "travel_management", label: "Travel Management" },
  { key: "asset_management", label: "Asset Management" },
  { key: "helpdesk_management", label: "Help Desk Management" },
  { key: "scheduled_reports", label: "Scheduled Reports" },
  { key: "hr_letters_management", label: "HR Letters Management" },
];

/**
 * Presentation-only grouping of MODULE_FEATURES for the plan editor.
 *
 * Eighteen flat toggles on one screen is unusable, so the plan editor renders
 * one collapsible section per group. This carries NO enforcement meaning: the
 * plan's `module_flags` is the only source of truth for access, and this
 * grouping must never be consulted to decide it.
 *
 * Every key must appear in exactly one group. `MODULE_GROUPS_ARE_COMPLETE` below
 * is asserted in tests so a newly added module cannot be forgotten here.
 */
export const MODULE_GROUPS: {
  key: string;
  label: string;
  moduleKeys: (keyof ModuleFlags)[];
}[] = [
  {
    key: "core_hr",
    label: "Core HR",
    moduleKeys: [
      "employee_management",
      "attendance_management",
      "user_management",
      "leave_management",
      "payroll_management",
    ],
  },
  {
    key: "workforce",
    label: "Workforce",
    moduleKeys: [
      "manpower_management",
      "recruitment_management",
      "onboarding_management",
      "separation_management",
      "training_management",
    ],
  },
  {
    key: "performance_pay",
    label: "Performance & Pay",
    moduleKeys: ["performance_management", "piece_work_management"],
  },
  {
    key: "money_ops",
    label: "Money Ops",
    moduleKeys: [
      "expense_management",
      "travel_management",
      "asset_management",
      "helpdesk_management",
    ],
  },
  {
    key: "automation",
    label: "Automation",
    moduleKeys: ["scheduled_reports", "hr_letters_management"],
  },
];

/** Every module, granted. Used when seeding a new plan and by tests. */
export const ALL_MODULE_FLAGS_ON: ModuleFlags = Object.fromEntries(
  MODULE_FEATURES.map((m) => [m.key, true]),
) as ModuleFlags;

export type SubscriptionPlan = {
  uuid: UUID;
  id?: number;
  name: string;
  monthly_price: number;
  daily_request_quota: number;
  description?: string | null;
  features?: PlanFeature[];
  billing_period: "monthly" | "yearly";
  is_public?: number;
  is_custom?: number;
  is_free?: number;
  is_recommended?: number;
  module_flags?: ModuleFlags | null;
  created_at?: string;
};

export type SubscriptionCheckout = {
  id?: number;
  uuid: UUID;
  status: "pending" | "completed" | "failed" | "cancelled" | "expired";
  amount?: number | null;
  currency?: string | null;
  plan_uuid?: string | null;
  plan_name?: string | null;
  gateway?: string | null;
  gateway_tracker_id?: string | null;
  gateway_event_id?: string | null;
  created_at?: string;
  updated_at?: string | null;
  completed_at?: string | null;
  failed_at?: string | null;
  organization_uuid?: string | null;
  organization_name?: string | null;
  subscription_status?: string | null;
  subscription_expiry?: string | null;
};

export type SubscriptionStatusResponse = {
  subscription: OrgSubscription;
  checkout: SubscriptionCheckout | null;
};

export type PaymentProvider = { code: string; label: string };

export type PurchasablePlan = {
  code: string;
  label: string;
  amount: number;
  duration_days: number;
};

export type DashboardStats = {
  total_users?: number;
  total_organizations?: number;
  total_verification_requests?: number;
  total_admin_requests?: number;
  active_users?: number;
  verified_organizations?: number;
  verified_requests?: number;
  unverified_requests?: number;
  under_review_requests?: number;
  users_progress?: number;
  organizations_progress?: number;
  requests_progress?: number;
  unmatched_progress?: number;
  upcoming_expirations?: Array<{
    uuid: string;
    name: string;
    subscription_expiry: string;
  }>;
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ AUTH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ VERIFICATION REQUESTS (user) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type PublicVerification = {
  valid: boolean;
  status: "verified";
  document_type: string;
  /** The document owner's name as captured on the request. */
  person_name: string | null;
  /** CNIC with everything but the last 4 digits masked, e.g. "*****-****234-3". */
  cnic_masked: string | null;
  organization_name: string | null;
  verification_date: string | null;
  /** Short human-readable code, e.g. "7K2M-9XQ4P". Stable for a certificate. */
  certificate_code: string | null;
  request_reference: string;
  /** What the stored file actually is, from a server-side extension allowlist. */
  file_type: "pdf" | "image" | "docx" | null;
  /** False when the server is not serving previews (PUBLIC_VERIFY_SHOW_DOCUMENT). */
  document_available: boolean;
  /**
   * SHA-256 of the original file, for pdf/image only. Null for every other
   * format and whenever the deployment disables previews — "Check your copy"
   * hides itself when this is null rather than showing a comparison that can
   * only fail.
   */
  document_hash: string | null;
};

/**
 * Public, unauthenticated result for an HR Letter QR.
 *
 * Distinct from PublicVerification because the fields are: a letter carries a
 * holder and an organisation rather than a CNIC and a file. A revoked letter is
 * NOT representable here — the server returns a 404 for it, the same as for a
 * forged or unknown token, so a scanner cannot tell the cases apart.
 */
export type PublicLetterVerification = {
  valid: boolean;
  reference_no: string;
  letter_type: string;
  title: string;
  /** The employee the letter was issued to. */
  holder_name: string;
  designation: string | null;
  organization_name: string;
  issued_at: string;
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ PAYMENTS (user) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ SUBSCRIPTION (org side: quota + custom plan) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ MARKETING (public, unauthenticated) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ ADMIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* ─────────────────────────── DOCUMENT TYPES ─────────────────────────── */

/**
 * The active document-type catalogue.
 *
 * Its own small service rather than a member of `adminService`, because the
 * ADMINISTRATION of the catalogue is system-admin-only while this READ is not:
 * an organization has to be able to populate its document-type dropdowns, so
 * `GET /document-types` is authenticated but open to any signed-in user. It
 * returns labels and schema keys only — no ids, no audit fields.
 */

export type AdminSidebarCounts = {
  leads: number;
  support_tickets: number;
  custom_plan_requests: number;
  unmatched_requests: number;
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ ORG-ADMIN (org-scoped) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ LEAVES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type LeaveType = {
  id: number;
  name: string;
  days_allowed_per_year: number;
  is_paid: "yes" | "no";
  organization_uuid?: UUID | null;
  organization_name?: string | null;
  created_at?: string;
};

export type LeaveRequest = {
  uuid: UUID;
  employee_uuid: UUID;
  employee_name?: string | null;
  employee_email?: string | null;
  designation?: string | null;
  leave_type_id: number;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  reason?: string | null;
  status: "pending" | "approved" | "rejected";
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  organization_uuid?: UUID | null;
  organization_name?: string | null;
};

export type LeaveBalance = {
  id: number;
  year: number;
  total_allocated: number;
  used: number;
  remaining: number;
  leave_type_id: number;
  leave_type_name: string;
};

export type LeaveAllocation = {
  leave_type_id: number;
  allocated_days: number;
  used_days: number;
  remaining_days: number;
};

export type EmployeeLeaveAllocation = {
  employee_uuid: UUID;
  full_name: string;
  email: string;
  designation?: string | null;
  department?: string | null;
  status: string;
  allocations: LeaveAllocation[];
};

export type EmployeeLeaveAllocationHistory = {
  year: number;
  allocated_days: number;
  used_days: number;
  remaining_days: number;
  leave_type_id: number;
  leave_type_name: string;
};

/* Platform user leaves */

/* Org-admin leave management + review */

/* Org-admin leave allocations (per employee, per type, per year) */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ ATTENDANCE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type AttendanceRecord = {
  uuid: UUID;
  employee_uuid: UUID;
  organization_id: number;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_ip: string | null;
  check_out_ip: string | null;
  date: string;
  status: "checked_in" | "checked_out";
  created_at: string;
  employee_name?: string | null;
  employee_email?: string | null;
  designation?: string | null;
  organization_uuid?: UUID | null;
  organization_name?: string | null;
};

export type IpRule = {
  id: number;
  ip_address: string;
  rule_type: "allow" | "deny";
};

/* Org-admin attendance + allowed office-network IPs */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ SALARY / PAYROLL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type SalaryRecord = {
  uuid: UUID;
  employee_uuid: UUID;
  month: number;
  year: number;
  basic_salary: string | number;
  allowances: string | number;
  deductions: string | number;
  net_salary: string | number;
  notes?: string | null;
  created_at?: string;
  employee_name?: string | null;
  employee_email?: string | null;
  designation?: string | null;
  organization_uuid?: UUID | null;
  organization_name?: string | null;
};

export type SalaryComponent = {
  id: number;
  uuid: UUID;
  organization_id: number;
  name: string;
  type: "allowance" | "deduction";
  is_percentage: boolean;
  default_value: string | number;
  is_active: boolean;
  created_at?: string;
};

export type SalaryHistoryEntry = {
  uuid: UUID;
  year: number;
  basic_salary: string | number;
  effective_from: string;
  effective_to: string | null;
  created_at?: string;
};

export type EmployeeSalaryComponent = {
  uuid: UUID;
  employee_uuid: UUID;
  salary_component_id: number;
  amount: string | number;
  is_active: boolean;
  assigned_at?: string;
  name: string;
  type: "allowance" | "deduction";
  component_is_percentage: boolean;
  component_default_value: string | number;
};

/* Org-admin payroll — auto-generated ledger with CSV export */

/* Org-admin defined allowances/deductions + employee salary history */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ LEADS TYPES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type LeadStatusHistory = {
  id: number;
  lead_type: "contact" | "access_request";
  lead_uuid: string;
  old_status: string | null;
  new_status: string;
  notes: string | null;
  changed_by_admin_id: number | null;
  changed_by_name: string | null;
  created_at: string;
};

export type ContactLead = {
  uuid: UUID;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  status: "new" | "contacted" | "closed";
  notes: string | null;
  latest_status: string | null;
  latest_note: string | null;
  latest_changed_by: string | null;
  latest_note_at: string | null;
  created_at: string;
};

export type AccessRequest = {
  uuid: UUID;
  organization_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  company_size: string | null;
  message: string | null;
  status: "new" | "contacted" | "onboarded" | "rejected";
  notes: string | null;
  latest_status: string | null;
  latest_note: string | null;
  latest_changed_by: string | null;
  latest_note_at: string | null;
  created_at: string;
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ LEADS (public) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ ADMIN LEADS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ ADMIN LOGIN HISTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type LoginHistoryRecord = {
  id: number;
  uuid: string;
  identity_type: "admin" | "user";
  identity_id: number;
  email?: string;
  full_name?: string;
  ip_address?: string;
  user_agent?: string;
  login_at: string;
  success: "yes" | "no";
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ ADMIN AUDIT LOGS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type AuditLogRecord = {
  id: number;
  uuid: string;
  actor_type: "admin" | "user";
  actor_id: number;
  actor_name?: string;
  actor_role?: "system_admin" | "org_admin" | "member" | "unknown";
  action: string;
  entity_type: string;
  entity_id?: string;
  details?: Record<string, unknown> | string | null;
  ip_address?: string;
  created_at: string;
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ DASHBOARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type AdminAnalytics = {
  requests_per_month: { month: string; count: number }[];
  request_status_breakdown: { status: string; count: number }[];
  orgs_registered_per_month: { month: string; count: number }[];
  top_organizations_by_requests: { org_name: string; request_count: number }[];
};

export type OrgDashboardAnalytics = {
  active_employee_count: number;
  pending_leave_requests_count: number;
  today_attendance: { present: number; total: number };
  this_month_payroll_total: number;
  quota_status: {
    free_daily_requests: number;
    plan_quota: number;
    total_allowance: number;
    requests_used: number;
    total_requests: number;
    requests_remaining: number;
    plan: { uuid: string | null; name: string | null; daily_request_quota: number };
  } | null;
  headcount_by_department: { department: string; count: number }[];
  today_attendance_breakdown: { present: number; late: number; absent: number; total: number };
  monthly_payroll_trend: { month: string; total: number }[];
  leave_utilization: { leave_type: string; days_used: number }[];
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ NOTIFICATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type Notification = {
  id: number;
  user_uuid: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  reference_id: string | null;
  read_at: string | null;
  created_at: string;
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ MEMBER SELF-SERVICE: ATTENDANCE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ MEMBER SELF-SERVICE: SALARY / PAYSLIPS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ SUPPORT TICKETS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export type SupportTicket = {
  uuid: UUID;
  subject: string;
  description: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
  organization_uuid?: UUID | null;
  organization_name?: string | null;
  raised_by_uuid?: UUID | null;
  raised_by_name?: string | null;
  raised_by_email?: string | null;
};

export type SupportReply = {
  uuid: UUID;
  message: string;
  replied_by_type: "admin" | "org_user";
  replied_by_uuid: UUID;
  replied_by_name?: string | null;
  replied_by_email?: string | null;
  created_at: string;
};

export type SupportTicketDetail = {
  ticket: SupportTicket;
  replies: SupportReply[];
};

/** Org side — an organization user raises and tracks their own tickets. */

/** System-admin side — cross-organization support triage. */
