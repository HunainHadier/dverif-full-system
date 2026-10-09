/**
 * Platform-admin console: users, organizations, verification triage, leads, audit.
 *
 *  * Kept apart from org.ts because these endpoints are the system admin's and are
 *  * explicitly 403 for org-scoped modules.
 *
 * Split out of the former single-file services/index.ts. Nothing here may import
 * anything except "@/lib/api" and "./core": services importing from lib/ would
 * close a runtime import cycle via lib/api -> lib/auth -> services.
 */

import { api, type Paginated } from "@/lib/api";

import type {
  UUID,
  DocumentType,
  DocumentTypeSyncStatus,
  Organization,
  VerificationRequest,
  UnmatchedOrganization,
  UnmatchedOrgDetail,
  AdminUserRecord,
  Payment,
  CustomPlanRequest,
  SelfSubscriptionRequest,
  SubscriptionPlan,
  SubscriptionCheckout,
  AdminSidebarCounts,
  LeadStatusHistory,
  ContactLead,
  AccessRequest,
  LoginHistoryRecord,
  AuditLogRecord,
} from "./core";
export const documentTypeService = {
  list: () =>
    api
      .get<{ items: { value: string; label: string; schema_key: string }[] }>("/document-types")
      .then((r) => r.data.items),
};

export const adminService = {
  sidebarCounts: () => api.get<AdminSidebarCounts>("/admin/sidebar-counts").then((r) => r.data),
  users: (params: { page?: number; limit?: number; search?: string } = {}) =>
    api.get<Paginated<AdminUserRecord>>("/admin/users", { params }).then((r) => r.data),
  createUser: (form: FormData) =>
    api
      .post<{ user: AdminUserRecord; _email_warning?: string }>("/admin/users", form)
      .then((r) => r.data),
  updateUser: (uuid: UUID, data: Record<string, unknown>) =>
    api.put<{ user: AdminUserRecord }>(`/admin/users/${uuid}`, data).then((r) => r.data.user),
  deleteUser: (uuid: UUID) => api.delete(`/admin/users/${uuid}`).then((r) => r.data),
  cancelInvite: (uuid: UUID) =>
    api.delete(`/admin/users/${uuid}/cancel-invite`).then((r) => r.data),
  resendInvite: (uuid: UUID) => api.post(`/admin/users/${uuid}/resend-invite`).then((r) => r.data),

  organizations: (
    params: { page?: number; limit?: number; search?: string; without_admin?: boolean } = {},
  ) => api.get<Paginated<Organization>>("/admin/organizations", { params }).then((r) => r.data),
  organizationTypes: () =>
    api
      .get<{ items: { id: number; name: string }[] }>("/admin/organization-types")
      .then((r) => r.data.items),
  createOrganizationType: (name: string) =>
    api
      .post<{ organization_type: { id: number; name: string } }>("/admin/organization-types", {
        name,
      })
      .then((r) => r.data.organization_type),
  deleteOrganizationType: (id: number) =>
    api.delete(`/admin/organization-types/${id}`).then((r) => r.data),

  // ── Document types (system-admin catalogue) ───────────────────────────────
  // The list used to be a hard-coded array (lib/documentTypes.ts) plus a mirrored
  // alias table in the Python service. It is now data, so a system admin can add
  // a type without a code change in two repositories.
  documentTypes: () =>
    api.get<{ items: DocumentType[] }>("/admin/document-types").then((r) => r.data.items),
  createDocumentType: (body: { name: string; schema_key?: string; description?: string }) =>
    api
      .post<{ document_type: DocumentType }>("/admin/document-types", body)
      .then((r) => r.data.document_type),
  updateDocumentType: (
    id: number,
    body: { name?: string; schema_key?: string; description?: string; is_active?: boolean },
  ) =>
    api
      .put<{ document_type: DocumentType }>(`/admin/document-types/${id}`, body)
      .then((r) => r.data.document_type),
  deleteDocumentType: (id: number) => api.delete(`/admin/document-types/${id}`).then((r) => r.data),
  /** Whether the OCR service currently knows the catalogue (shown in the panel). */
  documentTypeSyncStatus: () =>
    api
      .get<{ status: DocumentTypeSyncStatus }>("/admin/document-types/sync-status")
      .then((r) => r.data.status),

  /**
   * Full logical database backup (schema + data) as a .sql file.
   *
   * `responseType: "blob"` bypasses the response interceptor's envelope
   * unwrapping, so `r.data` is the file itself. Note that on failure axios
   * still resolves with a Blob containing the JSON error envelope, so callers
   * must not assume a Blob means success — the panel checks the content type.
   */
  downloadDatabaseBackup: async () => {
    const r = await api.get("/admin/database/backup", { responseType: "blob" });
    return r.data as Blob;
  },

  createOrganization: (form: FormData) =>
    api
      .post<{ organization: Organization }>("/admin/organizations", form)
      .then((r) => r.data.organization),
  updateOrganization: (uuid: UUID, form: FormData) =>
    api
      .put<{ organization: Organization }>(`/admin/organizations/${uuid}`, form)
      .then((r) => r.data.organization),
  deleteOrganization: (uuid: UUID) =>
    api.delete(`/admin/organizations/${uuid}`).then((r) => r.data),
  setOrganizationSubscription: (
    uuid: UUID,
    data: { plan?: "monthly" | "yearly"; plan_uuid?: string; amount?: number },
  ) =>
    api
      .patch<{ organization: Organization }>(`/admin/organizations/${uuid}/subscription`, data)
      .then((r) => r.data),
  cancelOrganizationSubscription: (uuid: UUID) =>
    api
      .delete<{ organization: Organization }>(`/admin/organizations/${uuid}/subscription`)
      .then((r) => r.data),

  requests: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) =>
    api
      .get<Paginated<VerificationRequest>>("/admin/verification-requests", { params })
      .then((r) => r.data),
  nullOrgRequests: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) =>
    api
      .get<Paginated<UnmatchedOrganization>>("/admin/verification-requests/null-organization", {
        params,
      })
      .then((r) => r.data),
  unmatchedOrgDetail: (uuid: UUID) =>
    api
      .get<UnmatchedOrgDetail>(`/admin/verification-requests/null-organization/${uuid}`)
      .then((r) => r.data),
  adminVerifyUnmatchedRequest: (
    uuid: UUID,
    data: { status: "verified" | "unverified"; verification_remarks: string },
  ) =>
    api
      .patch<{ request: VerificationRequest }>(
        `/admin/verification-requests/null-organization/${uuid}/verify`,
        data,
      )
      .then((r) => r.data.request),
  acceptRequest: (
    uuid: UUID,
    data: { verification_remarks: string; issuing_organization_uuid: UUID },
  ) =>
    api
      .patch<{ unmatched_org: UnmatchedOrganization }>(
        `/admin/verification-requests/${uuid}/accept`,
        data,
      )
      .then((r) => r.data.unmatched_org),
  lockRequest: (uuid: UUID) =>
    api
      .patch<{ request: VerificationRequest }>(`/admin/verification-requests/${uuid}/lock`)
      .then((r) => r.data.request),
  unlockRequest: (uuid: UUID) =>
    api
      .patch<{ request: VerificationRequest }>(`/admin/verification-requests/${uuid}/unlock`)
      .then((r) => r.data.request),
  deleteRequest: (uuid: UUID) =>
    api.delete(`/admin/verification-requests/${uuid}`).then((r) => r.data),
  slaRequests: (params: { page?: number; limit?: number; search?: string } = {}) =>
    api
      .get<Paginated<VerificationRequest>>("/admin/verification-requests/sla", { params })
      .then((r) => r.data),
  slaVerify: (
    uuid: UUID,
    data: { status: "verified" | "unverified"; verification_remarks: string },
  ) =>
    api
      .patch<{ request: VerificationRequest }>(`/admin/verification-requests/sla/${uuid}`, data)
      .then((r) => r.data.request),

  payments: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      method?: string;
      date_from?: string;
      date_to?: string;
    } = {},
  ) => api.get<Paginated<Payment>>("/admin/payment", { params }).then((r) => r.data),
  createPayment: (data: {
    user_uuid: UUID;
    amount: number;
    payment_method: "jazzcash" | "easypaisa" | "manual";
    transaction_reference: string;
    purpose: string;
  }) => api.post<{ payment: Payment }>("/admin/payment", data).then((r) => r.data.payment),

  customPlanRequests: (
    params: { status?: "pending" | "approved" | "denied"; page?: number; limit?: number } = {},
  ) =>
    api
      .get<Paginated<CustomPlanRequest>>("/admin/subscription/custom-plan-requests", { params })
      .then((r) => r.data),
  approveCustomPlanRequest: (uuid: UUID, data: { daily_quota: number; price: number }) =>
    api
      .post<{
        request: CustomPlanRequest;
        plan: { uuid: UUID; name: string; monthly_price: number; daily_request_quota: number };
      }>(`/admin/subscription/custom-plan-requests/${uuid}/approve`, data)
      .then((r) => r.data),
  denyCustomPlanRequest: (uuid: UUID) =>
    api
      .post<{ request: CustomPlanRequest }>(`/admin/subscription/custom-plan-requests/${uuid}/deny`)
      .then((r) => r.data),

  selfSubscriptionRequests: (
    params: { status?: "pending" | "confirmed" | "cancelled"; page?: number; limit?: number } = {},
  ) =>
    api
      .get<Paginated<SelfSubscriptionRequest>>("/admin/subscription/self-subscription-requests", {
        params,
      })
      .then((r) => r.data),
  subscriptionCheckouts: (params: { status?: string; page?: number; limit?: number } = {}) =>
    api
      .get<Paginated<SubscriptionCheckout>>("/admin/subscription/checkouts", { params })
      .then((r) => r.data),
  confirmSelfSubscriptionRequest: (uuid: UUID, data: { amount?: number } = {}) =>
    api
      .post<{ request: SelfSubscriptionRequest }>(
        `/admin/subscription/self-subscription-requests/${uuid}/confirm`,
        data,
      )
      .then((r) => r.data),
  cancelSelfSubscriptionRequest: (uuid: UUID) =>
    api
      .post<{ request: SelfSubscriptionRequest }>(
        `/admin/subscription/self-subscription-requests/${uuid}/cancel`,
      )
      .then((r) => r.data),

  plans: (params: { public?: number } = {}) =>
    api.get<{ items: SubscriptionPlan[] }>("/admin/plans", { params }).then((r) => r.data),
  createPlan: (data: Partial<SubscriptionPlan>) =>
    api.post<{ plan: SubscriptionPlan }>("/admin/plans", data).then((r) => r.data.plan),
  updatePlan: (uuid: UUID, data: Partial<SubscriptionPlan>) =>
    api.put<{ plan: SubscriptionPlan }>(`/admin/plans/${uuid}`, data).then((r) => r.data.plan),
  togglePlanPublic: (uuid: UUID, isPublic: boolean) =>
    api
      .post<{ plan: SubscriptionPlan }>(`/admin/plans/${uuid}/publish`, { is_public: isPublic })
      .then((r) => r.data.plan),
  deletePlan: (uuid: UUID) =>
    api.delete<{ uuid: UUID }>(`/admin/plans/${uuid}`).then((r) => r.data),
};

export const leadsService = {
  submitContact: (data: { name: string; email: string; phone?: string; message?: string }) =>
    api.post<{ lead: ContactLead }>("/leads/contact", data).then((r) => r.data.lead),
  submitAccessRequest: (data: {
    organization_name: string;
    contact_name: string;
    email: string;
    phone?: string;
    company_size?: string;
    message?: string;
  }) =>
    api.post<{ request: AccessRequest }>("/leads/request-access", data).then((r) => r.data.request),
};

export const adminLeadsService = {
  contactLeads: (params: { page?: number; limit?: number; search?: string } = {}) =>
    api.get<Paginated<ContactLead>>("/admin/leads/contact", { params }).then((r) => r.data),
  getContactLead: (uuid: string) =>
    api
      .get<{ lead: ContactLead; history: LeadStatusHistory[] }>(`/admin/leads/contact/${uuid}`)
      .then((r) => r.data),
  updateContactLeadStatus: (uuid: string, data: { status: string; notes?: string }) =>
    api
      .patch<{ lead: ContactLead }>(`/admin/leads/contact/${uuid}/status`, data)
      .then((r) => r.data.lead),
  accessRequests: (params: { page?: number; limit?: number; search?: string } = {}) =>
    api
      .get<Paginated<AccessRequest>>("/admin/leads/request-access", { params })
      .then((r) => r.data),
  getAccessRequest: (uuid: string) =>
    api
      .get<{ request: AccessRequest; history: LeadStatusHistory[] }>(
        `/admin/leads/request-access/${uuid}`,
      )
      .then((r) => r.data),
  updateAccessRequestStatus: (uuid: string, data: { status: string; notes?: string }) =>
    api
      .patch<{ request: AccessRequest }>(`/admin/leads/request-access/${uuid}/status`, data)
      .then((r) => r.data.request),
};

export const adminLoginHistoryService = {
  list: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      success?: string;
      date_from?: string;
      date_to?: string;
    } = {},
  ) =>
    api.get<Paginated<LoginHistoryRecord>>("/admin/login-history", { params }).then((r) => r.data),
};

export const adminAuditLogService = {
  list: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      action?: string;
      actor_type?: string;
      date_from?: string;
      date_to?: string;
    } = {},
  ) => api.get<Paginated<AuditLogRecord>>("/admin/audit-logs", { params }).then((r) => r.data),
  actions: () =>
    api.get<{ items: string[] }>("/admin/audit-logs/actions").then((r) => r.data.items),
};
