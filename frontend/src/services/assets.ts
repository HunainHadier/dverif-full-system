import { api, type Paginated } from "@/lib/api";
import type { UUID } from "./core";

/**
 * Asset management client.
 *
 * `status` is NOT settable from here. The server derives it from the open
 * assignment row, so there is deliberately no `status` field on
 * any create/update payload — offering one would invite a client to send a value
 * that is silently ignored, which is a worse failure than a missing field.
 */

export type AssetStatus = "available" | "assigned" | "retired";
export type AssetReturnCondition = "good" | "damaged";

export type AssetAttachment = {
  uuid: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  category: string | null;
  description: string | null;
  created_at: string;
};

export type AssetAssignment = {
  uuid: string;
  employee_uuid: string;
  employee_name: string;
  assigned_at: string;
  returned_at: string | null;
  return_condition: AssetReturnCondition | null;
  return_notes: string | null;
};


export type Asset = {
  uuid: UUID;
  asset_tag: string;
  name: string;
  model_details: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  vendor: string | null;
  warranty_expires_at: string | null;
  status: AssetStatus;
  notes: string | null;
  created_at: string;
  updated_at?: string;
  /** Present on list rows only, so the table can answer "who has this". */
  holder_name?: string | null;
};

export type AssetDetail = Asset & {
  holder: AssetAssignment | null;
  assignments: AssetAssignment[];
  receipts: AssetAttachment[];
};

export type AssetSummary = {
  by_status: Record<AssetStatus, number>;
  total_value: number;
};

export const ASSET_STATUSES: AssetStatus[] = ["available", "assigned", "retired"];

/**
 * Status -> badge variant. Retired is deliberately NOT destructive-red: a
 * scrapped laptop is a normal outcome of owning laptops, and painting it as an
 * error makes routine inventory read as a list of problems.
 */
export const ASSET_STATUS_VARIANT: Record<
  AssetStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  available: "default",
  assigned: "secondary",
  retired: "secondary",
};

/**
 * What an employee sees about their own hardware.
 *
 * A DISTINCT TYPE from Asset on purpose. An employee's view carries no cost, no
 * vendor and no notes — those are HR's, and `Asset` would make it trivial to
 * render them here by accident once someone copies a column across. Keeping the
 * type narrow means the compiler objects rather than the employee.
 */
export type MyAsset = {
  uuid: UUID;
  assignment_uuid: string;
  asset_tag: string;
  name: string;
  model_details: string | null;
  serial_number: string | null;
  warranty_expires_at: string | null;
  assigned_at: string;
};

export const assetsService = {
  list: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: AssetStatus;
    } = {},
  ) =>
    api
      .get<Paginated<Asset>>("/org/assets", {
        params: { ...params, search: params.search || undefined },
      })
      .then((r) => r.data),

  get: (uuid: UUID) =>
    api.get<{ asset: AssetDetail }>(`/org/assets/${uuid}`).then((r) => r.data.asset),

  summary: () => api.get<AssetSummary>("/org/assets/summary").then((r) => r.data),

  create: (data: {
    name: string;
    model_details?: string;
    serial_number?: string;
    purchase_date?: string;
    purchase_cost?: number;
    vendor?: string;
    warranty_expires_at?: string;
    notes?: string;
  }) => api.post<{ asset: AssetDetail }>("/org/assets", data).then((r) => r.data.asset),

  update: (
    uuid: UUID,
    data: {
      name?: string;
      asset_tag?: string;
      model_details?: string | null;
      serial_number?: string | null;
      /**
       * `string | null`, and the null is load-bearing.
       *
       * The server treats undefined as "leave this field alone" and null as
       * "clear this field". So an update that must be able to REMOVE a vendor,
       * a cost, model detail, serial number or note has to send null; sending undefined types
       * fine and silently does nothing, which looks like a save that worked.
       */
      purchase_date?: string | null;
      purchase_cost?: number | null;
      vendor?: string | null;
      warranty_expires_at?: string | null;
      notes?: string | null;
    },
  ) => api.put<{ asset: AssetDetail }>(`/org/assets/${uuid}`, data).then((r) => r.data.asset),

  assign: (uuid: UUID, employeeUuid: UUID) =>
    api
      .post<{
        status: AssetStatus;
        employee_name: string;
        /**
         * False when the employee has no portal account, so /my/assets can never
         * show them the assignment: that page resolves the employee from the
         * session via linked_user_uuid. Surfaced so the UI can warn - the staff
         * views all show the asset as assigned regardless.
         */
        employee_has_portal_account: boolean;
      }>(`/org/assets/${uuid}/assign`, { employee_uuid: employeeUuid })
      .then((r) => r.data),

  return: (uuid: UUID, condition: AssetReturnCondition, notes?: string) =>
    api
      .post<{ status: AssetStatus }>(
        `/org/assets/${uuid}/return`,
        { condition, notes: notes || undefined },
      )
      .then((r) => r.data),

  retire: (uuid: UUID, reason?: string) =>
    api.post<{ status: AssetStatus }>(`/org/assets/${uuid}/retire`, { reason }).then((r) => r.data),

  reinstate: (uuid: UUID) =>
    api.post<{ status: AssetStatus }>(`/org/assets/${uuid}/reinstate`).then((r) => r.data),

  // ---- attachments -------------------------------------------------------
  // Files are uploaded as multipart and stored as attachment entities, never as
  // a path column on the asset. See the backend's attachments.service.js.
  listReceipts: (uuid: UUID) =>
    api
      .get<{ items?: AssetAttachment[] }>(`/org/assets/${uuid}/receipts`)
      .then((r) => (Array.isArray(r.data.items) ? r.data.items : [])),

  uploadReceipts: (uuid: UUID, files: File[], description?: string) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    if (description) form.append("description", description);
    return api
      .post<{ items: AssetAttachment[] }>(`/org/assets/${uuid}/receipts`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data.items ?? []);
  },

  removeAttachment: (attachmentUuid: UUID) =>
    api.delete(`/org/asset-attachments/${attachmentUuid}`).then((r) => r.data),

  /**
   * Fetch an attachment as a Blob, through axios so the auth interceptor runs.
   *
   * A plain `<a href="/org/asset-attachments/...">` would NOT work: the endpoint
   * is authenticated, a new tab carries no Authorization header, and the result
   * is a 401 page rendered where a receipt should be. Going through axios and
   * handing the caller a Blob is what makes View and Download possible at all.
   *
   * The caller owns the resulting object URL and must revoke it.
   */
  downloadAttachment: (attachmentUuid: UUID) =>
    api
      .get(`/org/asset-attachments/${attachmentUuid}/download`, { responseType: "blob" })
      .then((r) => r.data as Blob),
};

/**
 * Employee self-service: assets currently assigned to me.
 *
 * Takes no parameters, and that is the point. The employee is derived from the
 * session, so there is no id a caller could change to read a colleague's
 * hardware. Read only: assigning, returning and retiring are HR actions, and the
 * server would refuse them here regardless.
 */
export const myAssetsService = {
  list: () =>
    api
      .get<{ items?: MyAsset[] }>("/my/assets")
      .then((r) => (Array.isArray(r.data.items) ? r.data.items : [])),
};
