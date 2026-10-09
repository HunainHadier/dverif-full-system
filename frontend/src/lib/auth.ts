import { useSyncExternalStore } from "react";
import axios from "axios";

export type Role = "admin" | "user";
import type { FeatureAccess } from "@/services";

export type AuthUser = {
  uuid: string;
  full_name: string;
  email: string;
  role: Role;
  profile_image?: string | null;
  phone?: string | null;
  organization?: number | null;
  org_role?: "employee" | "org_admin" | "sub_admin";
  feature_access?: FeatureAccess | null;
  preferred_language?: "en" | "ur";
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// ---------------------------------------------------------------------------
// Storage decision:
//   * The JWT access token lives ONLY in memory (module scope below) and is
//     NEVER written to localStorage. It cannot be exfiltrated via XSS and no
//     stale token survives a logout. After every full page load it is restored
//     once from the httpOnly refresh cookie via `ensureAuthenticated` (see the
//     router's `hydrate` option).
//   * The refresh token is untouched: httpOnly cookie, as before.
//   * The non-sensitive user PROFILE (Dverif_user below) stays in localStorage
//     so i18n can read `preferred_language` synchronously before React mounts
//     and guards/AppShell can show the right screen after a hard refresh.
// ---------------------------------------------------------------------------
let inMemoryToken: string | null = null;

let cachedRawUser: string | null = null;
let cachedParsedUser: AuthUser | null = null;

function userFromStorage(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("Dverif_user");
  if (raw === cachedRawUser) return cachedParsedUser;
  cachedRawUser = raw;
  let user: AuthUser | null = null;
  try {
    user = raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    user = null;
  }
  cachedParsedUser = user;
  return user;
}

function read(): { token: string | null; user: AuthUser | null } {
  return { token: inMemoryToken, user: userFromStorage() };
}

export const authStore = {
  get: read,
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  setSession(token: string, user: AuthUser) {
    inMemoryToken = token;
    window.localStorage.setItem("Dverif_user", JSON.stringify(user));
    emit();
  },
  setToken(token: string) {
    inMemoryToken = token;
    emit();
  },
  updateUser(user: AuthUser) {
    window.localStorage.setItem("Dverif_user", JSON.stringify(user));
    emit();
  },
  clear() {
    inMemoryToken = null;
    window.localStorage.removeItem("Dverif_user");
    emit();
  },
};

const serverSnap = { token: null as string | null, user: null as AuthUser | null };

// useSyncExternalStore requires getSnapshot to return a STABLE reference while
// the underlying state is unchanged. Returning a fresh `{ token, user }` literal
// on every call makes React see the snapshot as changed each render, which
// triggers "Maximum update depth exceeded". Track the last emitted snapshot and
// only rebuild it when the raw profile string or in-memory token actually move.
type AuthSnapshot = { token: string | null; user: AuthUser | null };

let cachedSnapshot: AuthSnapshot | null = null;
let snapshotRaw: string | null = null;
let snapshotToken: string | null = null;

function getSnapshot(): AuthSnapshot {
  const raw = typeof window === "undefined" ? null : window.localStorage.getItem("Dverif_user");
  if (cachedSnapshot && raw === snapshotRaw && snapshotToken === inMemoryToken) {
    return cachedSnapshot;
  }
  snapshotRaw = raw;
  snapshotToken = inMemoryToken;
  cachedSnapshot = { token: inMemoryToken, user: userFromStorage() };
  return cachedSnapshot;
}

export function useAuth() {
  return useSyncExternalStore(authStore.subscribe, getSnapshot, () => serverSnap);
}

// ---------------------------------------------------------------------------
// Bootstrap: repopulate the in-memory access token after a full page load.
// Hooked into the router's `hydrate` option (see src/router.tsx), which is
// awaited client-side during hydration BEFORE anything renders or fires an API
// call. Runs once per page load and is a no-op for SPA navigation afterwards.
// ---------------------------------------------------------------------------

const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL) || "/api/v1";

let bootstrapPromise: Promise<void> | null = null;

export function ensureAuthenticated(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    // Fast paths: token already in memory (later navigations), or no persisted
    // session profile at all (anonymous visitor — do not hit the network).
    if (authStore.get().token) return;
    if (!window.localStorage.getItem("Dverif_user")) return;

    try {
      const { data } = await axios.post(`${API_BASE}/auth/refresh`, null, {
        withCredentials: true,
      });
      const token = data?.data?.accessToken ?? data?.accessToken;
      // Only re-seed when the profile is STILL present: a logout that happened
      // mid-flight must not resurrect the token.
      if (token && window.localStorage.getItem("Dverif_user")) {
        authStore.setToken(token);
      }
    } catch (error) {
      // The cookie was explicitly rejected (HTTP response) -> the session is
      // gone; drop the stale profile. A pure network failure keeps the profile
      // (token stays null) so the next reload can retry without a forced
      // re-login.
      if ((error as { response?: unknown })?.response) {
        authStore.clear();
      }
    }
  })();

  return bootstrapPromise;
}
