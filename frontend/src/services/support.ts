/**
 * Support tickets, on both the org and the platform-admin side.
 *
 *  * Distinct from the internal Help Desk module: this is customer support.
 *
 * Split out of the former single-file services/index.ts. Nothing here may import
 * anything except "@/lib/api" and "./core": services importing from lib/ would
 * close a runtime import cycle via lib/api -> lib/auth -> services.
 */

import { api, type Paginated } from "@/lib/api";

import type { UUID, SupportTicket, SupportTicketDetail } from "./core";
export const orgSupportService = {
  list: (
    params: {
      page?: number;
      limit?: number;
      status?: string;
      priority?: string;
      search?: string;
    } = {},
  ) => api.get<Paginated<SupportTicket>>("/org/support/tickets", { params }).then((r) => r.data),
  create: (data: { subject: string; description: string; priority: "low" | "medium" | "high" }) =>
    api.post<{ ticket: SupportTicket }>("/org/support/tickets", data).then((r) => r.data),
  get: (uuid: UUID) =>
    api.get<SupportTicketDetail>(`/org/support/tickets/${uuid}`).then((r) => r.data),
  addReply: (uuid: UUID, message: string) =>
    api
      .post<SupportTicketDetail>(`/org/support/tickets/${uuid}/replies`, { message })
      .then((r) => r.data),
};

export const adminSupportService = {
  list: (
    params: {
      page?: number;
      limit?: number;
      status?: string;
      priority?: string;
      search?: string;
    } = {},
  ) => api.get<Paginated<SupportTicket>>("/admin/support-tickets", { params }).then((r) => r.data),
  get: (uuid: UUID) =>
    api.get<SupportTicketDetail>(`/admin/support-tickets/${uuid}`).then((r) => r.data),
  addReply: (uuid: UUID, message: string) =>
    api
      .post<SupportTicketDetail>(`/admin/support-tickets/${uuid}/replies`, { message })
      .then((r) => r.data),
  updateStatus: (uuid: UUID, status: SupportTicket["status"]) =>
    api
      .patch<{ ticket: SupportTicket }>(`/admin/support-tickets/${uuid}/status`, { status })
      .then((r) => r.data),
};
