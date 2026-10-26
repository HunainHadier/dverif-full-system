import type { AuthUser } from "@/lib/auth";
import { parseFeatureAccess } from "@/lib/utils";
import {
  FEATURE_KEYS,
  DELEGATED_FEATURE_KEYS,
  FEATURE_TRUE_BY_DEFAULT,
  type FeatureKey,
} from "@/lib/featureKeys";

/**
 * Re-exported so consumers have one import site for "who may open what".
 *
 * The canonical list is lib/featureKeys.ts; these are re-exports, not re-declarations,
 * so they cannot drift from it.
 */
export { FEATURE_KEYS, DELEGATED_FEATURE_KEYS, FEATURE_TRUE_BY_DEFAULT };

export type { FeatureKey };

/**
 * THE single source of truth for "may this user open this page?".
 *
 * Before this module the answer lived in two places that were written by hand
 * and had drifted apart:
 *
 *   - AppShell.tsx decided which sidebar links to render,
 *   - a stack of `if (location.pathname...)` blocks in _app.tsx plus a
 *     `beforeLoad` on each individual route file decided what to redirect to.
 *
 * Nothing tied the two together, so a link could be rendered for a user the
 * guards then bounced. Employee + Support was one instance (and the guards
 * there actively contradicted each other -- see below); /inbox and
 * /auto-verified were two more.
 *
 * Both the sidebar and every route guard now call canAccessRoute(). A
 * visible-but-dead link is no longer expressible: if the sidebar shows an item,
 * the guard that guards it consulted the same row of the same table.
 *
 * This governs CLIENT-side navigation only. It is a UX affordance, never a
 * security control -- every one of these pages is independently enforced by the
 * API's own requireRole()/requirePermission() checks, which are unchanged.
 */

export type OrgRole = "org_admin" | "sub_admin" | "employee";

/**
 * The feature_access keys, re-exported from the one canonical list.
 *
 * They used to be written out here as a second copy, alongside four others. A key
 * added on the server had to be remembered in five places on the client, and the
 * failure was silent. See lib/featureKeys.ts, which holds the array and derives this
 * type from it, so the two cannot drift.
 *
 * DEFAULT-DENY, and the split is deliberate: attendance/leave/payroll are an
 * employee's own self-service and default to granted, whereas hr_letters,
 * manage_assets, manage_separation and approve_expenses let someone attest to a
 * third party about another person's employment, spend the company's money, or end a
 * job. Those four did not exist at all until this change — every one of those modules
 * was reachable by any sub-admin regardless of feature_access — so default-deny is
 * the only defensible starting point for them.
 */

const ALL_ORG_ROLES: readonly OrgRole[] = ["org_admin", "sub_admin", "employee"];
const STAFF_ROLES: readonly OrgRole[] = ["org_admin", "sub_admin"];

/**
 * Roles that can be ON THE ROSTER — i.e. have an employee record of their own.
 *
 * `org_admin` is deliberately absent, and that is the whole point of this constant.
 *
 * The Personal ESS pages (/my-assets, /my-expenses, /my-resignation) each resolve the
 * caller to an employee record via the JWT, and when there is none they return an
 * EMPTY list rather than an error — `callerEmployee` returning null is a normal
 * answer, not a failure. An org_admin is the person who administers the company; they
 * are not on its payroll, so they have no asset assigned to them, no taxi they spent
 * their own money on, and no employment to resign from. Those pages are, for them,
 * three permanent empty shells dressed up as features.
 *
 * `sub_admin` stays, and the difference is not seniority — it is whether the person is
 * on the roster. A sub-admin can genuinely be an employee who was also granted
 * delegated permissions, and that person really is holding a company laptop. Removing
 * it from them would gate an employee out of their own reimbursement, which is the bug
 * the original "all org roles" rule was written to avoid.
 *
 * This is a UI and ROUTE_ACCESS decision only. The backend mounts these routes behind
 * `authUser` with no role check, and it should keep doing so: the server's job is to
 * answer the question it was asked, and the answer for an org_admin is a correct empty
 * list. This constant is about not ASKING.
 */
const ON_ROSTER_ROLES: readonly OrgRole[] = ["sub_admin", "employee"];

export type RouteRule = {
  /** org_roles that may open the page. Platform admins are handled separately. */
  roles: readonly OrgRole[];
  /**
   * feature_access key that additionally opens the page to a role in `roles`.
   * Omit for pages that are purely role-gated.
   */
  feature?: FeatureKey;
  /**
   * Roles that pass without holding `feature`. org_admin is the only role that
   * appears here, and only where the backend treats it as unconditionally
   * entitled.
   */
  always?: readonly OrgRole[];
};

/**
 * One row per navigable page.
 *
 * The `roles` lists below mirror the backend's middleware, which is the real
 * authority:
 *   - `/org/*` operational pages -> requireRole("org_admin", "sub_admin")
 *   - `/org/support`             -> requireRole("org_admin", "sub_admin", "employee")
 *   - `/leaves`, `/attendance`, `/payroll` -> requireRole("employee")
 *   - `/requests` and the inbox   -> requirePermission(generate_request / approve_request)
 * Note the two axes are independent: `roles` is who may enter at all, `feature`
 * is what a non-privileged role must additionally be granted.
 *
 * Plan-level modules (subscription_plans.module_flags: payroll_management,
 * employee_management, ...) are deliberately NOT here. That is a separate axis
 * keyed on the org's plan, not the user's role or feature_access, and it is
 * already surfaced as the "upgrade to unlock" affordance in the sidebar.
 */
export const ROUTE_ACCESS: Readonly<Record<string, RouteRule>> = {
  "/dashboard": { roles: ALL_ORG_ROLES },
  "/settings": { roles: ALL_ORG_ROLES },

  // --- Verification product -------------------------------------------------
  "/requests": { roles: ALL_ORG_ROLES, feature: "generate_request", always: ["org_admin"] },
  "/inbox": { roles: ALL_ORG_ROLES, feature: "approve_request", always: ["org_admin"] },
  "/auto-verified": { roles: ALL_ORG_ROLES, feature: "approve_request", always: ["org_admin"] },

  // --- Self-service: employees only ----------------------------------------
  // The API mounts these three behind requireRole("employee"), so staff must
  // never reach them even though the backend is happy to *read* for them.
  "/leaves": { roles: ["employee"], feature: "leave" },
  "/attendance": { roles: ["employee"], feature: "attendance" },
  "/payroll": { roles: ["employee"], feature: "payroll" },
  // Employee self-service. No feature_access key: letters are not delegable to
  // sub-admins via feature_access (see the /org/hr-letters note), and the
  // employee who receives a letter is not a delegated approver of anything.
  // Plan-level access is handled by ModuleGate via module_flags.
  "/my-letters": { roles: ["employee"] },

  // --- My assets ---------------------------------------------------------------
  // ALL ORG ROLES, which is the one deliberate difference from /my-letters above.
  //
  // The page answers "what equipment is assigned to ME", derived from the
  // session, so it leaks nobody else's hardware. That part is unchanged.
  //
  // ON_ROSTER_ROLES, not ALL_ORG_ROLES: a sub-admin who is ALSO on the roster has
  // genuinely been handed a laptop, and that person is the one most likely to be
  // mid-way through logging its serial number - so they keep it. An org_admin is not
  // on the payroll, has nothing assigned, and would only ever see an empty list.
  // See ON_ROSTER_ROLES for the full reasoning.
  //
  // Plan-level access is ModuleGate via module_flags (asset_management).
  "/my-assets": { roles: ON_ROSTER_ROLES },

  // --- My expenses -----------------------------------------------------------
  // ON_ROSTER_ROLES, for the same reason as /my-assets immediately above: a sub-admin
  // on the roster can reclaim their own taxi, an org_admin has no claim to file.
  // The backend still mounts this behind authUser with NO role check, and correctly
  // so - it answers the question it was asked, and for an org_admin the answer is an
  // empty list rather than an error.
  //
  // A sub-admin who is also on the roster gets a taxi to a client visit paid for
  // on their own time, exactly like a colleague, and gating them out of their own
  // reimbursement would be a bug rather than a policy. Someone with no employee
  // record gets an empty list, which is the correct answer rather than a 403.
  //
  // Plan-level access is ModuleGate via module_flags (expense_management).
  "/my-expenses": { roles: ON_ROSTER_ROLES },

  // --- Org operations ------------------------------------------------------
  // Support is the one org page every role can open: employees raise tier-1
  // tickets to their Organization Admin, org admins raise tier-2 tickets to the
  // System Admin, and sub-admins do the employee flow. The API enforces which
  // rows each role can actually see (own / org inbound / platform inbound).
  "/org/support": { roles: ALL_ORG_ROLES },
  "/org/team": { roles: STAFF_ROLES, feature: "manage_employees", always: ["org_admin"] },
  "/org/admins": { roles: ["org_admin"] },
  "/org/leaves": { roles: STAFF_ROLES, feature: "leave", always: ["org_admin"] },
  "/org/attendance": { roles: STAFF_ROLES, feature: "attendance", always: ["org_admin"] },
  "/org/salary-components": { roles: STAFF_ROLES, feature: "payroll", always: ["org_admin"] },
  "/org/payroll": { roles: STAFF_ROLES, feature: "payroll", always: ["org_admin"] },

  // --- HR letters ------------------------------------------------------------
  // STAFF_ROLES + the `hr_letters` permission.
  //
  // THIS REVERSES a deliberate earlier decision, and the reason it is now safe to
  // do so is worth recording. That decision made these org_admin-only "because
  // issuing an experience or increment letter is an act of the organization, and
  // sub-admin delegation for it would mean granting a sub-admin the power to attest
  // to someone's employment to a third party" — a good argument, but it lived ONLY
  // in this file. The backend gate was `hrLettersMgmt = [...staff, module]`, where
  // `staff` includes sub_admin, so every one of these routes already answered to any
  // sub-admin's JWT. The restriction was cosmetic: it removed a link from the
  // sidebar and bounced navigation, and did nothing to the API.
  //
  // So the choice was never "sub-admins can attest" versus "they cannot" — they
  // could, unconditionally. The only real decision available was whether an org
  // admin could WITHHOLD it per sub-admin. That is strictly more secure than what
  // was there, because it turns an unavoidable grant into a revocable one.
  "/org/letter-templates": { roles: STAFF_ROLES, feature: "hr_letters", always: ["org_admin"] },
  "/org/hr-letters": { roles: STAFF_ROLES, feature: "hr_letters", always: ["org_admin"] },

  // --- Assets ------------------------------------------------------------------
  // Two different gates on purpose, mirroring the backend's assetMgmt versus
  // assetCategoryMgmt.
  //
  // Inventory is operational: handing a laptop to someone and taking it back is
  // day-to-day work a sub-admin does, so /org/assets is STAFF_ROLES.
  //
  // Categories define what classes of asset EXIST, which changes what the
  // register reports on and what the default lifespan is used for. That is
  // org_admin only, same reasoning as letter templates above: it is a structural
  // decision, not a stock movement.
  //
  // Both now carry `manage_assets`. Before, both named only a role, so any sub-admin
  // with every permission switched off could still open both — the one place where
  // the sidebar and the guard agreed with each other and BOTH were wrong.
  "/org/assets": { roles: STAFF_ROLES, feature: "manage_assets", always: ["org_admin"] },
  "/org/asset-categories": { roles: ["org_admin"] },

  // --- Recruitment ------------------------------------------------------------
  // STAFF_ROLES + `manage_recruitment`, mirroring the backend's recruitmentMgmt gate.
  //
  // All FIVE routes carry the SAME rule rather than one being delegated and another
  // not. They are five tabs of one module over one set of rows: an opening, its
  // candidates, the board, the interviews and the offers all describe the same
  // hiring. Splitting access across them would produce a user who can approve an
  // offer but not see the candidate it belongs to, which is not a smaller capability
  // so much as an unusable one.
  //
  // `always: ["org_admin"]` so an org_admin passes on the role. The permission is
  // default-deny on the server, so without it an org admin would be locked out of
  // hiring their own staff — the exact failure mode the letters module had, where a
  // role-only gate quietly blocked the person who owns the company.
  "/org/recruitment/openings": {
    roles: STAFF_ROLES,
    feature: "manage_recruitment",
    always: ["org_admin"],
  },
  "/org/recruitment/candidates": {
    roles: STAFF_ROLES,
    feature: "manage_recruitment",
    always: ["org_admin"],
  },
  "/org/recruitment/pipeline": {
    roles: STAFF_ROLES,
    feature: "manage_recruitment",
    always: ["org_admin"],
  },
  "/org/recruitment/interviews": {
    roles: STAFF_ROLES,
    feature: "manage_recruitment",
    always: ["org_admin"],
  },
  "/org/recruitment/offers": {
    roles: STAFF_ROLES,
    feature: "manage_recruitment",
    always: ["org_admin"],
  },

  // --- Offboarding ------------------------------------------------------------
  // STAFF_ROLES, mirroring the backend's separationMgmt. A sub-admin is staff and
  // is documented as sharing operational access, and an exit is operational: they
  // chase the clearances and see the settlement.
  //
  // `manage_separation` is what gates it, default-deny on the server. This is the
  // highest-consequence module in the product — it ends someone's employment — and
  // until this permission existed every sub-admin could reach it regardless of what
  // an org admin had configured.
  "/org/offboarding": { roles: STAFF_ROLES, feature: "manage_separation", always: ["org_admin"] },

  // --- Expense claims (staff) -------------------------------------------------
  // STAFF_ROLES + `approve_expenses`. This is the review-and-settle queue: it can
  // approve a reimbursement and, for direct-mode claims, mark money as paid. Also
  // previously role-only, so any sub-admin could approve expenses.
  "/org/expense-claims": { roles: STAFF_ROLES, feature: "approve_expenses", always: ["org_admin"] },

  // The employee's own resignation. ON_ROSTER_ROLES: the backend mounts this with
  // authUser and no role check so a sub-admin who is also on the roster can serve
  // notice, and that person still can. An org_admin cannot — they have no employment
  // to resign from, so the page would be empty for them rather than forbidden, which
  // is the confusing version. See ON_ROSTER_ROLES.
  "/my-resignation": { roles: ON_ROSTER_ROLES },

  // --- Billing --------------------------------------------------------------
  // The org can *read* subscription status as any role, but every mutating
  // action on this page (checkout, self-subscribe, cancel downgrade) is
  // org_admin-only server-side, so the page as a whole is org_admin.
  "/payments": { roles: ["org_admin"] },
  // Where the provider sends the browser back to after a checkout. Only an
  // org_admin can start a checkout in the first place, and this page links
  // straight back to /payments.
  "/payment/callback": { roles: ["org_admin"] },
};

/**
 * Platform-admin pages. Not part of ROUTE_ACCESS because a platform admin is
 * not an org user at all: they get their own /admin/* area, and are explicitly
 * barred server-side from every org-scoped module.
 */
const PLATFORM_ADMIN_PREFIX = "/admin";
const PLATFORM_ADMIN_EXACT = new Set(["/dashboard", "/settings"]);

/** Normalise a path: strip a trailing slash and any query/hash. */
function normalize(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? "";
  const trimmed = withoutQuery.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * Find the rule for a path, walking up the segments so that a detail route
 * inherits its list route's rule -- /org/team/<uuid> is governed by the
 * "/org/team" row, and there is no second row to forget to update.
 */
function ruleForPath(path: string): RouteRule | null {
  let current = normalize(path);
  for (;;) {
    const rule = ROUTE_ACCESS[current];
    if (rule) return rule;
    const slash = current.lastIndexOf("/");
    if (slash <= 0) return null;
    current = current.slice(0, slash);
  }
}

/**
 * May `user` open `path`?
 *
 * Fails closed: an authenticated org user hitting a path with no row in
 * ROUTE_ACCESS is denied, so adding a page without deciding who may see it
 * fails visibly rather than defaulting to open.
 */
export function canAccessRoute(user: AuthUser | null | undefined, path: string): boolean {
  if (!user) return false;

  const p = normalize(path);

  if (user.role === "admin") {
    return (
      p === PLATFORM_ADMIN_PREFIX ||
      p.startsWith(`${PLATFORM_ADMIN_PREFIX}/`) ||
      PLATFORM_ADMIN_EXACT.has(p)
    );
  }

  // An org user must have a resolved org_role; anything else cannot be
  // evaluated against a role list, so it is denied.
  const orgRole = user.org_role;
  if (orgRole !== "org_admin" && orgRole !== "sub_admin" && orgRole !== "employee") {
    return false;
  }

  const rule = ruleForPath(p);
  if (!rule) return false;
  if (!rule.roles.includes(orgRole)) return false;

  if (!rule.feature) return true;
  if (rule.always?.includes(orgRole)) return true;

  return parseFeatureAccess(user.feature_access)[rule.feature];
}

/**
 * Every path in ROUTE_ACCESS, for tests and for asserting the sidebar and the
 * guards cannot drift apart.
 */
export function allKnownRoutes(): string[] {
  return Object.keys(ROUTE_ACCESS);
}
