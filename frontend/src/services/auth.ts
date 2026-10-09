/**
 * Authentication and identity endpoints.
 *
 *  * Login / OTP / refresh plus the profile endpoints, for both org users and the
 *  * platform admin (whose routes live under /admin/auth).
 *
 * Split out of the former single-file services/index.ts. Nothing here may import
 * anything except "@/lib/api" and "./core": services importing from lib/ would
 * close a runtime import cycle via lib/api -> lib/auth -> services.
 */

import { api, type Paginated } from "@/lib/api";

import type { FeatureAccess, UserRecord } from "./core";
export const authService = {
  login: (data: { email: string; password: string; rememberMe?: boolean }) =>
    api
      .post<{
        token: string;
        user: {
          uuid: string;
          full_name: string;
          email: string;
          profile_image?: string | null;
          role: "admin" | "user";
          org_role?: "employee" | "org_admin" | "sub_admin";
          feature_access?: string | FeatureAccess | null;
          preferred_language?: "en" | "ur";
        };
        requiresOtp?: boolean;
        identity_type?: string;
        identity_id?: string;
        email?: string;
        full_name?: string;
        profile_image?: string | null;
        rememberMe?: boolean;
      }>("/auth/login", data)
      .then((r) => r.data),
  verifyOtp: (data: {
    identity_type: string;
    identity_id: string;
    otp: string;
    rememberMe?: boolean;
  }) =>
    api
      .post<{
        token: string;
        user: {
          uuid: string;
          full_name: string;
          email: string;
          profile_image?: string | null;
          role: "admin" | "user";
          org_role?: "employee" | "org_admin" | "sub_admin";
          feature_access?: string | FeatureAccess | null;
          preferred_language?: "en" | "ur";
        };
      }>("/auth/verify-otp", data)
      .then((r) => r.data),
  resendOtp: (data: { identity_type: string; identity_id: string }) =>
    api.post("/auth/resend-otp", data).then((r) => r.data),
  adminLogin: (data: { email: string; password: string; rememberMe?: boolean }) =>
    api
      .post<{
        requiresOtp?: boolean;
        identity_type?: string;
        identity_id?: string;
        email?: string;
        full_name?: string;
        profile_image?: string | null;
        rememberMe?: boolean;
        token?: string;
        admin?: {
          uuid: string;
          email: string;
          full_name: string;
          profile_image?: string | null;
          preferred_language?: "en" | "ur";
        };
      }>("/admin/auth/login", data)
      .then((r) => r.data),
  adminVerifyOtp: (data: { identity_id: string; otp: string; rememberMe?: boolean }) =>
    api
      .post<{
        token: string;
        admin: {
          uuid: string;
          email: string;
          full_name: string;
          profile_image?: string | null;
          preferred_language?: "en" | "ur";
        };
      }>("/admin/auth/verify-otp", data)
      .then((r) => r.data),
  adminResendOtp: (data: { identity_id: string }) =>
    api.post("/admin/auth/resend-otp", data).then((r) => r.data),
  adminForgotPassword: (email: string) =>
    api.post("/admin/auth/forgot-password", { email }).then((r) => r.data),
  adminResetPassword: (token: string, newPassword: string) =>
    api.post("/admin/auth/reset-password", { token, newPassword }).then((r) => r.data),
  refresh: () => api.post<{ accessToken: string }>("/auth/refresh").then((r) => r.data),
  userLogout: () => api.post("/auth/user/logout").then((r) => r.data),
  adminLogout: () => api.post("/admin/auth/logout").then((r) => r.data),
  forgotPassword: (email: string) =>
    api.post("/auth/user/forgot-password", { email }).then((r) => r.data),
  resetPassword: (token: string, newPassword: string) =>
    api.post("/auth/user/reset-password", { token, newPassword }).then((r) => r.data),
  setPassword: (token: string, newPassword: string) =>
    api.post("/auth/user/set-password", { token, newPassword }).then((r) => r.data),
  validateInvite: (token: string) =>
    api
      .get<{ valid: boolean; reason?: "not_found" | "used" | "expired" }>(
        "/auth/user/invite-status",
        {
          params: { token },
        },
      )
      .then((r) => r.data),
  me: () => api.get<{ user: UserRecord }>("/users/me").then((r) => r.data.user),
  adminMe: () =>
    api
      .get<{
        admin: {
          uuid: string;
          email: string;
          full_name: string;
          phone?: string;
          profile_image?: string;
        };
      }>("/admin/auth/me")
      .then((r) => r.data.admin),
  updateProfile: (form: FormData) =>
    api.patch<{ user: UserRecord }>("/users/me", form).then((r) => r.data.user),
  setPreferredLanguage: (language: "en" | "ur") =>
    api
      .patch<{ preferred_language: "en" | "ur" }>("/users/preferred-language", { language })
      .then((r) => r.data),
  setAdminPreferredLanguage: (language: "en" | "ur") =>
    api
      .patch<{ preferred_language: "en" | "ur" }>("/admin/auth/me/preferred-language", { language })
      .then((r) => r.data),
  updateAdminProfile: (
    data:
      FormData | { full_name?: string; phone?: string; password?: string; old_password?: string },
  ) =>
    api
      .patch<{
        admin: {
          uuid: string;
          email: string;
          full_name: string;
          phone?: string;
          profile_image?: string;
        };
      }>("/admin/auth/profile", data)
      .then((r) => r.data.admin),
};
