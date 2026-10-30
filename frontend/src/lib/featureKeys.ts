/**
 * THE canonical feature_access key list. One array, no imports.
 *
 * WHY THIS MODULE EXISTS ALONE AND WHY IT IMPORTS NOTHING.
 *
 * The permission keys used to be written out in FIVE places across the app:
 * routeAccess.ts's FeatureKey, RequireOrgFeature's OrgFeatureKey, the org.admins
 * permission form, parseFeatureAccess's return shape, and usePermissions's return
 * shape — mirrored again by PERMISSION_KEYS in the backend. Every one of those is a
 * place a key can be added to the server and forgotten on the client, and the failure
 * is silent: a sub-admin whose permission was granted finds the module invisible, and
 * nothing says why.
 *
 * It was felt while adding the four HR-module keys (hr_letters, manage_assets,
 * manage_separation, approve_expenses). TypeScript immediately rejected
 * `FeatureKey` indexing three objects that did not have those properties, which is
 * the compiler correctly reporting that "two sources of truth" was really five.
 *
 * NO IMPORTS, deliberately. The obvious home for this array is routeAccess.ts, but
 * routeAccess imports parseFeatureAccess from utils, so utils importing the list
 * back from routeAccess would be a cycle — and a cyclic module is exactly the kind
 * of thing that half-works depending on import order. A leaf file with no
 * dependencies is the only placement that cannot cycle.
 *
 * `hrModulePermissions.test.ts` asserts this array matches the backend's
 * PERMISSION_KEYS exactly, so the remaining pair of sources — this file and the
 * server — cannot drift either.
 */

/**
 * Every delegatable permission, in the backend's order.
 *
 * Order matches the server's PERMISSION_KEYS deliberately: the backend has tests
 * pinning that array, so appending here keeps a diff between the two readable
 * instead of showing a reorder that means nothing.
 */
export const FEATURE_KEYS = [
  "attendance",
  "leave",
  "payroll",
  "manage_employees",
  "generate_request",
  "approve_request",
  "hr_letters",
  "manage_assets",
  "manage_separation",
  "approve_expenses",
  "manage_recruitment",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

/**
 * Keys granted when feature_access is absent or a key is omitted.
 *
 * Mirrors the backend's TRUE_BY_DEFAULT, and the split is not arbitrary:
 *
 *  - attendance, leave, payroll are an EMPLOYEE'S OWN SELF-SERVICE. Denying by
 *    default would lock people out of clocking in and asking for leave, which is
 *    not a security posture anyone wants.
 *  - everything else is DELEGATED AUTHORITY over other people — issuing letters,
 *    handling company assets, ending employment, approving spend, running a hiring
 *    pipeline that ends in an employee record. Default-deny, so a sub-admin holds
 *    nothing an org admin did not consciously hand them.
 */
export const FEATURE_TRUE_BY_DEFAULT: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "attendance",
  "leave",
  "payroll",
]);

/** Every feature_access key as a boolean map, defaults applied. */
export type FeatureAccessMap = Record<FeatureKey, boolean>;

/**
 * Normalise a raw feature_access value into a complete boolean map.
 *
 * Defined HERE rather than in utils so that every consumer — parseFeatureAccess,
 * usePermissions, the org.admins form — resolves the same defaults from the same
 * code. utils.parseFeatureAccess is kept as a re-export alias because eleven files
 * import it and renaming the call sites would be churn with no benefit.
 */
export function buildFeatureAccess(raw: unknown): FeatureAccessMap {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      // A malformed column must not throw on a permission check: the safe reading
      // of "I cannot tell what this user may do" is the DEFAULT set, which denies
      // delegated authority and keeps self-service.
      obj = {};
    }
  } else if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>;
  }

  const out = {} as FeatureAccessMap;
  for (const key of FEATURE_KEYS) {
    out[key] = obj[key] === undefined ? FEATURE_TRUE_BY_DEFAULT.has(key) : !!obj[key];
  }
  return out;
}

/** Every key denied by default — i.e. everything an org admin must grant explicitly. */
export const DELEGATED_FEATURE_KEYS: readonly FeatureKey[] = FEATURE_KEYS.filter(
  (k) => !FEATURE_TRUE_BY_DEFAULT.has(k),
);
