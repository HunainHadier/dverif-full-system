/**
 * Dashboards, notifications and employee self-service.
 *
 *  * attendanceService and salaryService are the EMPLOYEE-facing reads; their
 *  * org-wide counterparts live in hr.ts.
 *
 * Split out of the former single-file services/index.ts. Nothing here may import
 * anything except "@/lib/api" and "./core": services importing from lib/ would
 * close a runtime import cycle via lib/api -> lib/auth -> services.
 */

import { api, type Paginated } from "@/lib/api";

import type {
  DashboardStats,
  AttendanceRecord,
  SalaryRecord,
  AdminAnalytics,
  OrgDashboardAnalytics,
  Notification,
} from "./core";
export const dashboardService = {
  auto: () => api.get<DashboardStats>("/dashboard").then((r) => r.data),
  admin: () => api.get<DashboardStats>("/dashboard/admin").then((r) => r.data),
  user: () => api.get<DashboardStats>("/dashboard/user").then((r) => r.data),
  analytics: () => api.get<AdminAnalytics>("/dashboard/analytics").then((r) => r.data),
  orgAnalytics: () =>
    api.get<OrgDashboardAnalytics>("/org/dashboard/analytics").then((r) => r.data),
};

export const notificationService = {
  list: (params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<Notification>>("/notifications", { params }).then((r) => r.data),
  unreadCount: () =>
    api.get<{ count: number }>("/notifications/unread-count").then((r) => r.data.count),
  markRead: (id: number) => api.post(`/notifications/${id}/read`).then((r) => r.data),
  markReadByReference: (referenceId: string) =>
    api.post(`/notifications/read-by-reference/${referenceId}`).then((r) => r.data),
  markAllRead: () => api.post("/notifications/read-all").then((r) => r.data),
};

export const attendanceService = {
  today: () =>
    api.get<{ record: AttendanceRecord | null }>("/attendance/today").then((r) => r.data),
  checkIn: () => api.post<{ record: AttendanceRecord }>("/attendance/check-in").then((r) => r.data),
  checkOut: () =>
    api.post<{ record: AttendanceRecord }>("/attendance/check-out").then((r) => r.data),
  history: (
    params: {
      page?: number;
      limit?: number;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
    } = {},
  ) => api.get<Paginated<AttendanceRecord>>("/attendance/history", { params }).then((r) => r.data),
};

export const salaryService = {
  mine: (params: { page?: number; limit?: number; month?: string; year?: string } = {}) =>
    api.get<Paginated<SalaryRecord>>("/salary-records/mine", { params }).then((r) => r.data),
};
