import { describe, it, expect } from "vitest";

import {
  canAccessRoute,
  ROUTE_ACCESS,
  allKnownRoutes,
  type FeatureKey,
  type OrgRole,
} from "@/lib/routeAccess";
import { allNavPaths } from "@/lib/navItems";
import type { AuthUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// canAccessRoute is the one place that answers "may this user open this page?".
// It is consulted by the sidebar (is this link rendered?) and by the route
// guards (may this navigation proceed?), so if it disagrees with itself the app
// grows a link that leads nowhere -- which is the bug these tests exist to stop
// recurring. Employee + Support was the original instance.
// ---------------------------------------------------------------------------

const ALL_FEATURES: FeatureKey[] = [
  "attendance",
  "leave",
  "payroll",
  "manage_employees",
  "generate_request",
  "approve_request",
];

function user(over: Partial<AuthUser> = {}): AuthUser {
  return {
    uuid: "u-1",
    full_name: "Test User",
    email: "t@example.com",
    role: "user",
    organization: 1,
    org_role: "employee",
    feature_access: null,
    ...over,
  };
}

/** A user with the given org_role and an explicit feature_access map. */
function withFlags(orgRole: OrgRole, flags: Record<FeatureKey, boolean>): AuthUser {
  return user({ org_role: orgRole, feature_access: flags });
}

const everyFlagOn = ALL_FEATURES.reduce<Record<FeatureKey, boolean>>(
  (acc, k) => ({ ...acc, [k]: true }),
  {} as Record<FeatureKey, boolean>,
);
const everyFlagOff = ALL_FEATURES.reduce<Record<FeatureKey, boolean>>(
  (acc, k) => ({ ...acc, [k]: false }),
  {} as Record<FeatureKey, boolean>,
);

/**
 * Pages the API mounts behind requireRole("employee"), so no staff role may
 * open them however many permissions it holds. Derived from the table rather
 * than hard-coded, so adding a third employee-only page needs no test edit.
 */
const EMPLOYEE_ONLY_PATHS = allKnownRoutes().filter((p) => {
  const r = ROUTE_ACCESS[p].roles;
  return r.length === 1 && r[0] === "employee";
});

/**
 * Pages an org_admin cannot open, DERIVED FROM THE TABLE rather than hard-coded.
 *
 * This grew a second member. Until the Personal ESS change, org_admin could reach
 * everything except EMPLOYEE_ONLY_PATHS, so that list was the complete set of
 * exceptions and one derived filter was enough. Now three self-service pages also
 * exclude org_admin -- not because they are employee-exclusive, but because they
 * resolve the caller to an employee record and an org_admin has none.
 *
 * Derived rather than listed, for the same reason EMPLOYEE_ONLY_PATHS is: a
 * hard-coded exclusion list is a place for the next route to be forgotten.
 */
const ORG_ADMIN_EXCLUDED_PATHS = allKnownRoutes().filter(
  (p) => !ROUTE_ACCESS[p].roles.includes("org_admin"),
);

/** Everything a platform admin must never reach. */
const ORG_SCOPED_PATHS = allKnownRoutes().filter((p) => p !== "/dashboard" && p !== "/settings");

// ---------------------------------------------------------------------------
// The invariant the whole design rests on
// ---------------------------------------------------------------------------

describe("canAccessRoute — honours its own table exactly", () => {
  // Exhaustive over every role x every feature_access combination. If the
  // predicate and the table ever diverge, this is what notices.
  const combos: { name: string; u: AuthUser }[] = [];
  for (const orgRole of ["org_admin", "sub_admin", "employee"] as OrgRole[]) {
    for (let mask = 0; mask < 1 << ALL_FEATURES.length; mask++) {
      const flags = {} as Record<FeatureKey, boolean>;
      ALL_FEATURES.forEach((k, i) => {
        flags[k] = Boolean(mask & (1 << i));
      });
      const on = ALL_FEATURES.filter((_, i) => mask & (1 << i));
      combos.push({
        name: `${orgRole} [${on.join(",") || "none"}]`,
        u: withFlags(orgRole, flags),
      });
    }
  }

  it("builds 3 x 64 combinations", () => {
    expect(combos).toHaveLength(3 * 64);
  });

  it.each(combos)("$name matches the table row for every route", ({ u }) => {
    for (const [path, rule] of Object.entries(ROUTE_ACCESS)) {
      const roleOk = rule.roles.includes(u.org_role as OrgRole);
      const expected =
        roleOk &&
        (!rule.feature ||
          !!rule.always?.includes(u.org_role as OrgRole) ||
          !!u.feature_access?.[rule.feature]);
      expect(canAccessRoute(u, path), `path=${path} rule=${JSON.stringify(rule)}`).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// Platform admin
// ---------------------------------------------------------------------------

describe("canAccessRoute — platform admin", () => {
  const admin = user({ role: "admin", org_role: undefined, organization: null });

  it("reaches the /admin area", () => {
    for (const p of [
      "/admin/users",
      "/admin/organizations",
      "/admin/requests",
      "/admin/support",
      "/admin/support/abc-123",
      "/admin/leads",
    ]) {
      expect(canAccessRoute(admin, p), p).toBe(true);
    }
  });

  it("reaches /dashboard and /settings", () => {
    expect(canAccessRoute(admin, "/dashboard")).toBe(true);
    expect(canAccessRoute(admin, "/settings")).toBe(true);
  });

  it("is denied every org-scoped page, however privileged its flags", () => {
    for (const p of ORG_SCOPED_PATHS) {
      expect(canAccessRoute(admin, p), p).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// org_admin
// ---------------------------------------------------------------------------

describe("canAccessRoute — org_admin", () => {
  it("reaches every org page regardless of feature_access", () => {
    const admin = user({ org_role: "org_admin", feature_access: everyFlagOff });
    for (const p of allKnownRoutes().filter((r) => !ORG_ADMIN_EXCLUDED_PATHS.includes(r))) {
      expect(canAccessRoute(admin, p), p).toBe(true);
    }
  });

  it("is denied the employee-only self-service pages, which are role-exclusive server-side", () => {
    const admin = user({ org_role: "org_admin", feature_access: everyFlagOn });
    expect(EMPLOYEE_ONLY_PATHS.length).toBeGreaterThan(0);
    for (const p of EMPLOYEE_ONLY_PATHS) {
      expect(canAccessRoute(admin, p), p).toBe(false);
    }
  });

  it("is not given the admin area", () => {
    const admin = user({ org_role: "org_admin", feature_access: everyFlagOn });
    expect(canAccessRoute(admin, "/admin/users")).toBe(false);
    expect(canAccessRoute(admin, "/admin/requests")).toBe(false);
  });

  it("reaches billing and the payment callback", () => {
    const admin = user({ org_role: "org_admin" });
    expect(canAccessRoute(admin, "/payments")).toBe(true);
    expect(canAccessRoute(admin, "/payment/callback")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sub_admin
// ---------------------------------------------------------------------------

describe("canAccessRoute — sub_admin", () => {
  it("with no permissions gets the ungated pages only", () => {
    const s = withFlags("sub_admin", everyFlagOff);
    expect(canAccessRoute(s, "/dashboard")).toBe(true);
    expect(canAccessRoute(s, "/settings")).toBe(true);
    expect(canAccessRoute(s, "/org/support")).toBe(true);
  });

  it("with no permissions is denied every permission-gated page", () => {
    const s = withFlags("sub_admin", everyFlagOff);
    for (const p of [
      "/requests",
      "/inbox",
      "/auto-verified",
      "/org/team",
      "/org/leaves",
      "/org/attendance",
      "/org/salary-components",
      "/org/payroll",
    ]) {
      expect(canAccessRoute(s, p), p).toBe(false);
    }
  });

  it("is always denied org_admin-only pages", () => {
    const s = withFlags("sub_admin", everyFlagOn);
    expect(canAccessRoute(s, "/org/admins")).toBe(false);
    expect(canAccessRoute(s, "/payments")).toBe(false);
    expect(canAccessRoute(s, "/payment/callback")).toBe(false);
  });

  it("is always denied the employee self-service pages", () => {
    const s = withFlags("sub_admin", everyFlagOn);
    expect(canAccessRoute(s, "/leaves")).toBe(false);
    expect(canAccessRoute(s, "/attendance")).toBe(false);
    expect(canAccessRoute(s, "/payroll")).toBe(false);
  });

  it("opens exactly the page each granted permission unlocks", () => {
    const cases: [FeatureKey, string][] = [
      ["generate_request", "/requests"],
      ["approve_request", "/inbox"],
      ["approve_request", "/auto-verified"],
      ["manage_employees", "/org/team"],
      ["leave", "/org/leaves"],
      ["attendance", "/org/attendance"],
      ["payroll", "/org/salary-components"],
      ["payroll", "/org/payroll"],
    ];
    for (const [flag, path] of cases) {
      const off = { ...everyFlagOff, [flag]: true } as Record<FeatureKey, boolean>;
      const on = { ...everyFlagOff, [flag]: true } as Record<FeatureKey, boolean>;
      expect(canAccessRoute(withFlags("sub_admin", on), path), `${flag} -> ${path}`).toBe(true);
      expect(
        canAccessRoute(withFlags("sub_admin", everyFlagOff), path),
        `${flag} off -> ${path}`,
      ).toBe(false);
      // The permission must not leak into unrelated pages.
      for (const other of allKnownRoutes()) {
        const rule = ROUTE_ACCESS[other];
        if (rule.feature === flag || !rule.feature) continue;
        if (rule.always?.includes("sub_admin")) continue;
        if (!rule.roles.includes("sub_admin")) continue;
        expect(
          canAccessRoute(withFlags("sub_admin", off), other),
          `leak: ${flag} -> ${other}`,
        ).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// employee  (the reported bug lives here)
// ---------------------------------------------------------------------------

describe("canAccessRoute — employee", () => {
  it("can open Support to raise a tier-1 ticket to their organization admin", () => {
    const e = user({ org_role: "employee", feature_access: everyFlagOn });
    expect(canAccessRoute(e, "/org/support")).toBe(true);
    expect(canAccessRoute(e, "/org/support/abc-123")).toBe(true);
  });

  it("cannot open the staff-only org pages, even holding every permission", () => {
    const e = user({ org_role: "employee", feature_access: everyFlagOn });
    for (const p of allKnownRoutes().filter((r) => r.startsWith("/org/") && r !== "/org/support")) {
      expect(canAccessRoute(e, p), p).toBe(false);
    }
  });

  it("cannot open org_admin-only or staff-only pages", () => {
    const e = user({ org_role: "employee", feature_access: everyFlagOn });
    for (const p of ["/org/admins", "/org/team", "/payments", "/payment/callback"]) {
      expect(canAccessRoute(e, p), p).toBe(false);
    }
  });

  it("reaches the self-service pages under their default flags", () => {
    // feature_access absent -> attendance/leave/payroll default to true,
    // matching the backend's TRUE_BY_DEFAULT set.
    const e = user({ org_role: "employee", feature_access: null });
    expect(canAccessRoute(e, "/attendance")).toBe(true);
    expect(canAccessRoute(e, "/payroll")).toBe(true);
    expect(canAccessRoute(e, "/leaves")).toBe(true);
  });

  it("loses a self-service page when its permission is explicitly revoked", () => {
    const e = user({
      org_role: "employee",
      feature_access: { ...everyFlagOn, attendance: false } as AuthUser["feature_access"],
    });
    expect(canAccessRoute(e, "/attendance")).toBe(false);
    expect(canAccessRoute(e, "/payroll")).toBe(true);
  });

  it("never reaches the admin area", () => {
    const e = user({ org_role: "employee", feature_access: everyFlagOn });
    expect(canAccessRoute(e, "/admin/users")).toBe(false);
  });

  it("reaches the verification pages when granted generate/approve", () => {
    const e = user({ org_role: "employee", feature_access: everyFlagOn });
    expect(canAccessRoute(e, "/requests")).toBe(true);
    expect(canAccessRoute(e, "/inbox")).toBe(true);
    expect(canAccessRoute(e, "/auto-verified")).toBe(true);

    const none = user({ org_role: "employee", feature_access: everyFlagOff });
    expect(canAccessRoute(none, "/requests")).toBe(false);
    expect(canAccessRoute(none, "/inbox")).toBe(false);
    expect(canAccessRoute(none, "/auto-verified")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Path handling
// ---------------------------------------------------------------------------

describe("canAccessRoute — path handling", () => {
  const admin = user({ org_role: "org_admin" });

  it("lets a detail route inherit its list route's rule", () => {
    expect(canAccessRoute(admin, "/org/team/abc-123")).toBe(true);
    expect(canAccessRoute(admin, "/org/support/abc-123")).toBe(true);
    expect(canAccessRoute(admin, "/auto-verified/abc-123")).toBe(true);
  });

  it("denies a detail route under a list route the role cannot enter", () => {
    // No flags at all, so the only thing that can grant access is the role.
    const e = user({ org_role: "employee", feature_access: everyFlagOff });
    expect(canAccessRoute(e, "/org/team/abc-123")).toBe(false);
    // Support is open to every org role by design; its list rule carries over.
    expect(canAccessRoute(e, "/org/support/abc-123")).toBe(true);
    expect(canAccessRoute(e, "/auto-verified/abc-123")).toBe(false);

    const s = withFlags("sub_admin", everyFlagOff);
    expect(canAccessRoute(s, "/org/team/abc-123")).toBe(false);
    expect(canAccessRoute(s, "/auto-verified/abc-123")).toBe(false);
  });

  it("ignores a trailing slash, query string and hash", () => {
    expect(canAccessRoute(admin, "/org/support/")).toBe(true);
    expect(canAccessRoute(admin, "/org/support?page=2")).toBe(true);
    expect(canAccessRoute(admin, "/org/support#top")).toBe(true);
    expect(canAccessRoute(user({ org_role: "employee" }), "/org/support/")).toBe(true);
  });

  it("fails closed for an unknown path", () => {
    expect(canAccessRoute(admin, "/org/does-not-exist")).toBe(false);
    expect(canAccessRoute(admin, "/nope")).toBe(false);
  });

  it("denies an unauthenticated caller everywhere", () => {
    for (const p of [...allKnownRoutes(), "/admin/users", "/anything"]) {
      expect(canAccessRoute(null, p), p).toBe(false);
      expect(canAccessRoute(undefined, p), p).toBe(false);
    }
  });

  it("denies an org user with no resolved org_role", () => {
    const broken = user({ org_role: undefined });
    expect(canAccessRoute(broken, "/dashboard")).toBe(false);
    expect(canAccessRoute(broken, "/settings")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The guarantee that actually prevents recurrence
// ---------------------------------------------------------------------------

describe("sidebar and guards cannot drift apart", () => {
  it("gives every sidebar path a row in the route table", () => {
    const missing = allNavPaths.filter((p) => !(p in ROUTE_ACCESS) && !p.startsWith("/admin"));
    expect(missing, `sidebar paths with no ROUTE_ACCESS row: ${missing.join(", ")}`).toEqual([]);
  });

  it("covers every /admin path a platform admin can reach", () => {
    // Platform-admin pages are governed by the /admin prefix rather than a
    // table row; assert none of them leaks into the org table.
    for (const p of allNavPaths.filter((n) => n.startsWith("/admin"))) {
      expect(ROUTE_ACCESS[p], p).toBeUndefined();
    }
  });

  it("has no sidebar path that no role can open", () => {
    const probes: AuthUser[] = [
      user({ role: "admin", org_role: undefined }),
      user({ org_role: "org_admin", feature_access: everyFlagOn }),
      user({ org_role: "sub_admin", feature_access: everyFlagOn }),
      user({ org_role: "employee", feature_access: everyFlagOn }),
    ];
    const orphans = allNavPaths.filter((p) => !probes.some((u) => canAccessRoute(u, p)));
    expect(orphans, `sidebar paths no role can open: ${orphans.join(", ")}`).toEqual([]);
  });

  it("keeps /org/support reachable by every org role", () => {
    // Tier 1 is employee -> org_admin, so the employee must be able to open the
    // page that raises the ticket. The API still limits the rows they see.
    const e = user({ org_role: "employee", feature_access: everyFlagOn });
    expect(ROUTE_ACCESS["/org/support"].roles).toContain("employee");
    expect(canAccessRoute(e, "/org/support")).toBe(true);
  });
});
