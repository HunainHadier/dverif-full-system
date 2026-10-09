/**
 * Organization core: employees, departments, designations, org users.
 *
 *  * Employee RECORDS, as distinct from the operational modules in hr.ts.
 *
 * Split out of the former single-file services/index.ts. Nothing here may import
 * anything except "@/lib/api" and "./core": services importing from lib/ would
 * close a runtime import cycle via lib/api -> lib/auth -> services.
 */

import { api, type Paginated } from "@/lib/api";

import type {
  UUID,
  FeatureAccess,
  EmployeeRecord,
  EmployeeDocument,
  ManagedOption,
  OrgUserRecord,
  OrgAdminUserRecord,
} from "./core";
export const orgService = {
  employees: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      reference?: boolean;
      /**
       * "org" widens the list to the whole organization roster.
       *
       * By default an org_admin sees only the employee records they personally
       * added. That is right for the Employees page (a work queue of what I
       * imported) and wrong for a picker over the company, so anything choosing
       * a person to hand company property to must pass this — otherwise a
       * colleague another admin onboarded simply does not exist as far as the
       * picker is concerned. It never widens past your own organization.
       */
      scope?: "org";
    } = {},
  ) => api.get<Paginated<EmployeeRecord>>("/org/employees", { params }).then((r) => r.data),
  getEmployee: (uuid: UUID) =>
    api.get<{ employee: EmployeeRecord }>(`/org/employees/${uuid}`).then((r) => r.data.employee),
  createEmployee: (data: Record<string, unknown>) =>
    api
      .post<{ employee: EmployeeRecord; _email_warning?: string }>("/org/employees", data)
      .then((r) => r.data),
  createReference: (data: { full_name: string; cnic: string }) =>
    api
      .post<{ employee: EmployeeRecord }>("/org/employees/reference", data)
      .then((r) => r.data.employee),
  createReferenceEmployee: (data: { full_name: string; cnic: string }) =>
    api
      .post<{ employee: EmployeeRecord }>("/org/employees/reference", data)
      .then((r) => r.data.employee),
  updateEmployee: (uuid: UUID, data: Record<string, unknown>) =>
    api
      .put<{ employee: EmployeeRecord }>(`/org/employees/${uuid}`, data)
      .then((r) => r.data.employee),
  deleteEmployee: (uuid: UUID) => api.delete(`/org/employees/${uuid}`).then((r) => r.data),
  archiveReference: (uuid: UUID) =>
    api
      .post<{ employee: EmployeeRecord }>(`/org/employees/${uuid}/archive-reference`)
      .then((r) => r.data.employee),
  resendInvite: (uuid: UUID) =>
    api.post<{ message?: string }>(`/org/employees/${uuid}/resend-invite`).then((r) => r.data),
  departments: {
    list: () => api.get<{ items: ManagedOption[] }>("/org/departments").then((r) => r.data.items),
    create: (name: string) =>
      api.post<ManagedOption>("/org/departments", { name }).then((r) => r.data),
    remove: (uuid: UUID) => api.delete(`/org/departments/${uuid}`).then((r) => r.data),
  },
  designations: {
    list: () => api.get<{ items: ManagedOption[] }>("/org/designations").then((r) => r.data.items),
    create: (name: string) =>
      api.post<ManagedOption>("/org/designations", { name }).then((r) => r.data),
    remove: (uuid: UUID) => api.delete(`/org/designations/${uuid}`).then((r) => r.data),
  },
  employeeDocuments: {
    list: (employeeUuid: UUID) =>
      api
        .get<{ items: EmployeeDocument[] }>(`/org/employees/${employeeUuid}/documents`)
        .then((r) => r.data.items),
    upload: (employeeUuid: UUID, form: FormData) =>
      api
        .post<{ items: EmployeeDocument[] }>(`/org/employees/${employeeUuid}/documents`, form)
        .then((r) => r.data.items),
    remove: (docUuid: UUID) =>
      api.delete(`/org/employees/documents/${docUuid}`).then((r) => r.data),
  },

  users: (params: { page?: number; limit?: number; search?: string } = {}) =>
    api.get<Paginated<OrgUserRecord>>("/org/users", { params }).then((r) => r.data),

  adminUsers: {
    list: (params: { page?: number; limit?: number; search?: string } = {}) =>
      api.get<Paginated<OrgAdminUserRecord>>("/org/admin-users", { params }).then((r) => r.data),
    create: (data: {
      full_name: string;
      email: string;
      cnic: string;
      phone?: string;
      feature_access: Pick<
        FeatureAccess,
        "manage_employees" | "generate_request" | "approve_request"
      >;
    }) =>
      api
        .post<{ user: OrgAdminUserRecord; _email_warning?: string }>("/org/admin-users", data)
        .then((r) => r.data),
    revoke: (uuid: UUID, action: "demote" | "deactivate") =>
      api
        .post<{ user: OrgAdminUserRecord }>(`/org/admin-users/${uuid}/revoke`, { action })
        .then((r) => r.data.user),
    update: (
      uuid: UUID,
      feature_access: Pick<
        FeatureAccess,
        "manage_employees" | "generate_request" | "approve_request"
      >,
    ) =>
      api
        .patch<{ user: OrgAdminUserRecord }>(`/org/admin-users/${uuid}`, { feature_access })
        .then((r) => r.data.user),
    /**
     * Cancel a pending invitation. Only valid while is_verified === 'no'; the
     * backend refuses otherwise, so this is not merely a UI nicety.
     */
    cancelInvite: (uuid: UUID) =>
      api.delete(`/org/admin-users/${uuid}/cancel-invite`).then((r) => r.data),
    /** Permanently delete a sub-admin who never accepted. Same 'no'-only rule. */
    remove: (uuid: UUID) => api.delete(`/org/admin-users/${uuid}`).then((r) => r.data),
  },
};
