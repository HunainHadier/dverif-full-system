import axios from "axios";
import { authStore } from "./auth";

const baseURL =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL) || "/api/v1";

const isServer = typeof window === "undefined";

export const api = axios.create({
  baseURL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (!isServer) {
    const token = authStore.get().token;
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (error || !token) p.reject(error);
    else p.resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (r) => {
    const body = r.data;
    if (body && typeof body === "object" && "data" in body && "success" in body) {
      r.data = body.data;
    }
    return r;
  },
  async (error) => {
    if (isServer) return Promise.reject(error);

    const originalRequest = error?.config;
    const status = error?.response?.status;
    const msg = (error?.response?.data?.message ?? error?.response?.data?.error ?? "") as string;

    const AUTH_ENDPOINTS = [
      "/auth/login",
      "/auth/verify-otp",
      "/auth/resend-otp",
      "/auth/user/forgot-password",
      "/auth/user/reset-password",
      "/auth/user/set-password",
      "/admin/auth/login",
    ];
    const isAuthEndpoint = AUTH_ENDPOINTS.some(
      (p) => typeof originalRequest?.url === "string" && originalRequest.url.includes(p),
    );

    // Force-logout deactivated accounts on any API call.
    if (status === 403 && /inactive|deactivated/i.test(msg) && !isAuthEndpoint) {
      const wasAdmin = authStore.get().user?.role === "admin";
      authStore.clear();
      window.location.href = wasAdmin ? "/system-admin/login" : "/login";
      return Promise.reject(error);
    }

    if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(`${baseURL}/auth/refresh`, null, {
          withCredentials: true,
        });
        const newToken = data?.data?.accessToken ?? data?.accessToken;
        if (newToken) {
          // Only re-seed the refreshed token (in memory) if a live session is
          // still present. After a logout the user object is removed, so we
          // must NOT write the refreshed token back, otherwise the login
          // page's beforeLoad would see it and bounce the user away.
          if (authStore.get().user) {
            authStore.setToken(newToken);
          }
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
        throw new Error("No token in refresh response");
      } catch (refreshError) {
        processQueue(refreshError, null);
        const wasAdmin = authStore.get().user?.role === "admin";
        authStore.clear();
        if (
          !window.location.pathname.startsWith("/login") &&
          !window.location.pathname.startsWith("/system-admin/login") &&
          !window.location.pathname.startsWith("/system-admin/")
        ) {
          window.location.href = wasAdmin ? "/system-admin/login" : "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export type Paginated<T> = { items: T[]; total: number; page: number; totalPages: number };
