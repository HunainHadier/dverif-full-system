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

export function hasEntireOrganizationScope(user: AuthUser | null | undefined, moduleKey: string): boolean {
  if (isOrgAdmin(user)) return true;
  let raw: unknown = user?.feature_access;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return false; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const scopes = (raw as Record<string, unknown>).data_scopes;
  return !!scopes
    && typeof scopes === "object"
    && !Array.isArray(scopes)
    && (scopes as Record<string, unknown>)[moduleKey] === "entire_organization";
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
const GRANULAR_BY_FEATURE: Partial<Record<FeatureKey, string>> = {
  attendance: "attendance.view",
  leave: "leave_management.view",
  payroll: "payroll.view",
  manage_employees: "employees.view",
  generate_request: "document_verification.generate_request",
  approve_request: "document_verification.view_requests",
  hr_letters: "hr_letters.view",
  manage_assets: "assets.view",
  manage_separation: "offboarding.view",
  approve_expenses: "expenses.view",
  create_expenses: "expenses.create_own",
  manage_recruitment: "recruitment.view",
};

const ACTION_REQUIRES_VIEW: Readonly<Record<string, string>> = {
  "employees.create": "employees.view",
  "document_verification.generate_request": "document_verification.view_requests",
  "leave_management.allocate_balance": "leave_management.view",
  "payroll.generate": "payroll.view",
  "payroll.manage_settings": "payroll.view",
  "payroll.manage_employee_components": "payroll.view",
  "expenses.create_own": "expenses.view",
  "hr_letters.create_draft": "hr_letters.view",
  "assets.create": "assets.view",
  "recruitment.create_job": "recruitment.view",
};

function readGranularMatrix(user?: AuthUser | null): { exists: boolean; grants: Record<string, unknown> } {
  let raw: unknown = user?.feature_access;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { exists: false, grants: {} };
  const matrix = (raw as Record<string, unknown>).granular_permissions;
  if (!matrix || typeof matrix !== "object" || Array.isArray(matrix)) return { exists: false, grants: {} };
  return { exists: true, grants: matrix as Record<string, unknown> };
}

/** Exact granular action check, with legacy fallback only before a matrix is saved. */
export function hasGranularPermission(user: AuthUser | null | undefined, permission: string, legacyFeature?: FeatureKey): boolean {
  if (!user) return false;
  if (isOrgAdmin(user)) return true;
  const matrix = readGranularMatrix(user);
  if (matrix.exists) {
    if (matrix.grants[permission] === true) return true;
    return Object.entries(ACTION_REQUIRES_VIEW).some(
      ([action, view]) => view === permission && matrix.grants[action] === true,
    );
  }
  return legacyFeature ? parseFeatureAccess(user.feature_access)[legacyFeature] : false;
}

/**
 * Effective legacy feature aliases for existing components. Once the granular
 * matrix exists, each alias reflects its module's VIEW action (or the specific
 * self-service create action), never a broad write grant.
 */
export function usePermissions(): FeatureAccessMap & {
  granular: Record<string, boolean>;
  hasGranular: (permission: string, legacyFeature?: FeatureKey) => boolean;
  isOrgAdmin: boolean;
  isSubAdmin: boolean;
  isEmployee: boolean;
} {
  const { user } = useAuth();
  const isOrgAdminUser = isOrgAdmin(user);
  const matrix = readGranularMatrix(user);
  const fa = parseFeatureAccess(user?.feature_access);

  const effective = {} as FeatureAccessMap;
  for (const key of FEATURE_KEYS) {
    const granularKey = GRANULAR_BY_FEATURE[key];
    const allowed = matrix.exists && granularKey
      ? hasGranularPermission(user, granularKey, key)
      : fa[key];
    effective[key] = isOrgAdminUser || allowed;
  }

  const hasGranular = (permission: string, legacyFeature?: FeatureKey) =>
    isOrgAdminUser || (matrix.exists
      ? matrix.grants[permission] === true
      : legacyFeature ? fa[legacyFeature] : false);

  const granular: Record<string, boolean> = {};
  for (const [feature, permission] of Object.entries(GRANULAR_BY_FEATURE)) {
    if (permission) granular[permission] = isOrgAdminUser || (
      hasGranularPermission(user, permission, feature as FeatureKey)
    );
  }

  return {
    ...effective,
    granular,
    hasGranular,
    isOrgAdmin: isOrgAdminUser,
    isSubAdmin: isSubAdmin(user),
    isEmployee: isEmployee(user),
  };
}
