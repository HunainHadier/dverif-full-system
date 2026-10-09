import { useAuth, type AuthUser } from "@/lib/auth";
import type { FeatureAccessKey } from "@/services";
import { parseFeatureAccess } from "@/lib/utils";
import { FEATURE_KEYS, type FeatureAccessMap, type FeatureKey } from "@/lib/featureKeys";

export type Role = "org_admin" | "sub_admin" | "employee";

/** True when the user is a platform admin (system-level) account. */
export function isPlatformAdmin(user?: AuthUser | null): boolean {
  return !!user && user.role === "admin";
}

/** True when the user is an organization admin (full control). */
export function isOrgAdmin(user?: AuthUser | null): boolean {
  return !!user && user.role === "user" && user.org_role === "org_admin";
}

/** True when the user is a sub-admin (operational staff access). */
export function isSubAdmin(user?: AuthUser | null): boolean {
  return !!user && user.role === "user" && user.org_role === "sub_admin";
}

/** True when the user is an ordinary employee (self-service only). */
export function isEmployee(user?: AuthUser | null): boolean {
  return !!user && user.role === "user" && user.org_role === "employee";
}

/** Staff = org_admin + sub_admin (share all operational management access). */
export function isStaff(user?: AuthUser | null): boolean {
  return isOrgAdmin(user) || isSubAdmin(user);
}

/**
 * Role predicates only. "May this user open this page?" is answered by
 * canAccessRoute() in @/lib/routeAccess, which is the single source of truth
 * shared by the sidebar and every route guard.
 */

/** True when the user has full staff (org_admin or sub_admin) power. */
export function can(user: AuthUser | null | undefined): boolean {
  return isStaff(user);
}

export function useRoles() {
  const { user } = useAuth();
  return {
    isPlatformAdmin: isPlatformAdmin(user),
    isOrgAdmin: isOrgAdmin(user),
    isSubAdmin: isSubAdmin(user),
    isEmployee: isEmployee(user),
    isStaff: isStaff(user),
  };
}

/**
 * The user's effective permissions.
 *
 * SPREAD OVER THE PARSED MAP RATHER THAN LISTING KEYS. This function used to return
 * six named booleans written out one per line, which meant a key added to the
 * server silently had no entry here — and because it was a literal, TypeScript said
 * nothing. Building it from the same map everything else uses means a new permission
 * is present the moment it is declared, and cannot be forgotten here.
 *
 * org_admin is OR-ed across the board rather than short-circuited, because the shape
 * has to stay a complete FeatureAccessMap for callers that index it by a key chosen
 * at runtime.
 */
export function usePermissions(): FeatureAccessMap & {
  isOrgAdmin: boolean;
  isSubAdmin: boolean;
  isEmployee: boolean;
} {
  const { user } = useAuth();
  const isOrgAdminUser = isOrgAdmin(user);
  const fa = parseFeatureAccess(user?.feature_access);

  const effective = {} as FeatureAccessMap;
  for (const key of Object.keys(fa) as FeatureKey[]) {
    effective[key] = isOrgAdminUser || fa[key];
  }

  return {
    ...effective,
    isOrgAdmin: isOrgAdminUser,
    isSubAdmin: isSubAdmin(user),
    isEmployee: isEmployee(user),
  };
}
