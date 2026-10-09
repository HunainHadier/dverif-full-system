/**
 * The verification product: requests, inbox and public QR lookup.
 *
 *  * Owns the private API_BASE used by verifyService's raw fetch calls, which
 *  * bypass axios to stream a blob from an unauthenticated public endpoint.
 *
 * Split out of the former single-file services/index.ts. Nothing here may import
 * anything except "@/lib/api" and "./core": services importing from lib/ would
 * close a runtime import cycle via lib/api -> lib/auth -> services.
 */

import { api, type Paginated } from "@/lib/api";

import type {
  UUID,
  Organization,
  VerificationRequest,
  AutoVerifiedHistory,
  PublicVerification,
  PublicLetterVerification,
} from "./core";
export const requestsService = {
  organizations: () =>
    api
      .get<{ items: Organization[] }>("/verification-requests/organizations")
      .then((r) => r.data.items),
  create: (form: FormData) =>
    api
      .post<{ request: VerificationRequest }>("/verification-requests", form)
      .then((r) => r.data.request),
  mySent: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) =>
    api
      .get<Paginated<VerificationRequest>>("/verification-requests/my/sent", { params })
      .then((r) => r.data),
  deleteSent: (uuid: UUID) =>
    api.delete(`/verification-requests/my/sent/${uuid}`).then((r) => r.data),
  updateSent: (uuid: UUID, form: FormData) =>
    api
      .put<{ request: VerificationRequest }>(`/verification-requests/my/sent/${uuid}`, form)
      .then((r) => r.data.request),
  myInbox: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) =>
    api
      .get<Paginated<VerificationRequest>>("/verification-requests/my/inbox", { params })
      .then((r) => r.data),
  myInboxCount: () =>
    api.get<{ count: number }>("/verification-requests/my/inbox/count").then((r) => r.data.count),
  myAutoVerified: (
    params: {
      page?: number;
      limit?: number;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) =>
    api
      .get<Paginated<VerificationRequest>>("/verification-requests/my/auto-verified", { params })
      .then((r) => r.data),
  autoVerifiedHistory: (uuid: UUID) =>
    api
      .get<AutoVerifiedHistory>(`/verification-requests/my/auto-verified/${uuid}/history`)
      .then((r) => r.data),
  requestDetail: (uuid: UUID) =>
    api
      .get<{ request: VerificationRequest }>(`/verification-requests/my/inbox/${uuid}`)
      .then((r) => r.data.request),
  verify: (
    uuid: UUID,
    data: {
      status: "verified" | "unverified";
      verification_remarks: string;
    },
  ) =>
    api
      .patch<{ request: VerificationRequest }>(`/verification-requests/${uuid}/verify`, data)
      .then((r) => r.data.request),
  downloadCertificate: async (uuid: UUID) => {
    const r = await api.get(`/verification-requests/${uuid}/certificate`, {
      responseType: "blob",
    });
    return r.data as Blob;
  },
};

/**
 * Only verifyService's raw `fetch` calls need this, because they bypass axios
 * to stream a blob from an unauthenticated public endpoint. Every other call
 * goes through the shared instance in lib/api.ts, which already knows the base.
 *
 * Narrow local type rather than `as any`: Vite's ImportMetaEnv is augmented per
 * project, and casting through `any` silenced a genuine class of typo here.
 */
const API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL) ||
  "/api/v1";

export const verifyService = {
  verify: (qrToken: string) =>
    api.get<PublicVerification>(`/verify/${qrToken}`).then((r) => r.data),

  /**
   * Public HR Letter verification.
   *
   * Its own `/verify/letter/` segment, matching the URL already printed in the
   * QR code on every issued letter. The token is encoded because it reaches us
   * from a QR scan.
   */
  verifyLetter: (qrToken: string) =>
    api
      .get<PublicLetterVerification>(`/verify/letter/${encodeURIComponent(qrToken)}`)
      .then((r) => r.data),

  /**
   * Absolute URL of the public document stream. The browser fetches this
   * directly (it is unauthenticated and the token IS the credential), so it is
   * built here rather than going through the axios instance's auth interceptor.
   */
  documentUrl: (qrToken: string) => `${API_BASE}/verify/${encodeURIComponent(qrToken)}/document`,

  /**
   * Fetch the document as a blob. Used for DOCX, which the page renders
   * client-side; PDF and image are shown straight from the URL so the browser's
   * own viewer does the work.
   */
  documentBlob: async (qrToken: string): Promise<Blob> => {
    const res = await fetch(verifyService.documentUrl(qrToken), {
      credentials: "omit",
    });
    if (!res.ok) throw new Error(`Document request failed (${res.status})`);
    return res.blob();
  },
};
