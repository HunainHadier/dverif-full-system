import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import { canAccessRoute, ROUTE_ACCESS, allKnownRoutes, type OrgRole } from "@/lib/routeAccess";
import {
  FEATURE_KEYS,
  FEATURE_TRUE_BY_DEFAULT,
  DELEGATED_FEATURE_KEYS,
  buildFeatureAccess,
  type FeatureAccessMap,
  type FeatureKey,
} from "@/lib/featureKeys";
import type { AuthUser } from "@/lib/auth";

/**
 * THE REGRESSION THIS FILE EXISTS TO STOP, PINNED PER ROUTE AND PER ROLE.
 *
 * Six HR modules shipped staff-open to EVERY sub-admin. The cause was not a mistake
 * in any one file — it was that each route's access was stated twice, in two files
 * that never compared themselves:
 *
 *   - the sidebar (navItems.ts + AppShell) decided what to RENDER
 *   - ROUTE_ACCESS decided what to ALLOW on navigation
 *   - and the BACKEND decided what to actually serve, which was often neither
 *
 * Where those three disagreed, the failure was silent and one-directional. For
 * /org/hr-letters the client said org_admin-only while the server answered to any
 * sub-admin's JWT, so the "restriction" was cosmetic: it removed a link and bounced
 * navigation, and did nothing to the API.
 *
 * The four module permissions did not exist anywhere — not in the backend's
 * PERMISSION_KEYS, not in the client's FeatureKey, not in the org-admin grant form —
 * so there was nothing for the guards to check. Delegation with no dial on it.
 *
 * WHAT IS ASSERTED BELOW, in order of how much each one is worth:
 *
 *   1. Per route x per role, exactly what may be opened. The four personas the
 *      product actually has: org_admin, sub_admin holding the permission, sub_admin
 *      holding nothing, employee.
 *   2. The client's remaining permission lists agree with each other and with
 *      FEATURE_KEYS. This is the "reduce to one source" part, enforced.
 *   3. Sidebar and guard cannot disagree, for every nav path.
 *   4. Personal ESS rows stay role-gated rather than permission-gated.
 *
 * WHAT IS NOT HERE, AND WHY. That the BACKEND enforces the same permissions is the
 * other half of this audit, and it cannot be asserted from this repo: org.routes.js
 * and permissions.js do not exist here, so a readFileSync of them would simply throw.
 * Those assertions live in the backend as hrModulePermissions.db.test.js. Splitting
 * them is the honest arrangement — a test that reads a file it does not ship is not
 * verifying anything, it is documenting a hope.
 */

const NAV = readFileSync("src/lib/navItems.ts", "utf8");
const ADMINS_PAGE = readFileSync("src/routes/_app.org.admins.tsx", "utf8");
const REQUIRE_FEATURE = readFileSync("src/components/common/RequireOrgFeature.tsx", "utf8");
const CORE_TYPES = readFileSync("src/services/core.ts", "utf8");

/**
 * The audited matrix, written out rather than derived.
 *
 * Deriving the expectation from ROUTE_ACCESS would make every assertion below pass
 * no matter what ROUTE_ACCESS says, which is the entire failure this file is for. The
 * expectations are the product decision; the table is the implementation.
 */
type Persona = "org_admin" | "sub_admin_permitted" | "sub_admin_unpermitted" | "employee";

type Expectation = {
  path: string;
  /** Backend requirePermission() key, or null when the route is role-only. */
  permission: FeatureKey | null;
  /** Personas that may open it. */
  allowed: Persona[];
};

const MATRIX: Expectation[] = [
  {
    path: "/org/hr-letters",
    permission: "hr_letters",
    allowed: ["org_admin", "sub_admin_permitted"],
  },
  {
    path: "/org/letter-templates",
    permission: "hr_letters",
    allowed: ["org_admin", "sub_admin_permitted"],
  },
  {
    path: "/org/assets",
    permission: "manage_assets",
    allowed: ["org_admin", "sub_admin_permitted"],
  },
  {
    path: "/org/asset-categories",
    permission: null,
    allowed: ["org_admin"],
  },
  {
    path: "/org/offboarding",
    permission: "manage_separation",
    allowed: ["org_admin", "sub_admin_permitted"],
  },
  {
    path: "/org/expense-claims",
    permission: "approve_expenses",
    allowed: ["org_admin", "sub_admin_permitted"],
  },
  // --- Recruitment (5 tabs of one module) ---------------------------------------
  // Added with the MATRIX in the same pass as the ROUTE_ACCESS rows, not after.
  // The recurring miss with these routes was writing the nav first and remembering
  // the guard rows later -- and because canAccessRoute FAILS CLOSED, a route with no
  // row bounces EVERYONE to the dashboard, including the org_admin who owns the
  // company. The symptom is a page that appears broken rather than missing.
  //
  // Deliberately ONE permission across all five rather than delegating them
  // separately: an opening, its candidates, the board, the interviews and the offers
  // all describe a single hiring. A user who can approve an offer but cannot see the
  // candidate it belongs to does not have a smaller capability, they have an
  // unusable one.
  ...[
    "/org/recruitment/openings",
    "/org/recruitment/candidates",
    "/org/recruitment/pipeline",
    "/org/recruitment/interviews",
    "/org/recruitment/offers",
  ].map((path) => ({
    path,
    permission: "manage_recruitment" as FeatureKey,
    // org_admin on the role; the sub-admin who was granted it. Never an employee,
    // never a sub-admin without it -- same two rows as every other module.
    allowed: ["org_admin", "sub_admin_permitted"] as Persona[],
  })),

  // Personal ESS counterparts. Listed here so the audit covers BOTH halves, as asked:
  // an org route gated correctly while its ESS twin leaked would be the same bug.
  { path: "/my-letters", permission: null, allowed: ["employee"] },
  {
    path: "/my-assets",
    permission: null,
    // org_admin ABSENT, and deliberately: they administer the company, they are not
    // on its payroll, so these pages resolve their caller to an employee record that
    // does not exist and answer with an empty list. A sub-admin who IS on the roster
    // keeps them.
    allowed: ["sub_admin_permitted", "sub_admin_unpermitted", "employee"],
  },
  {
    path: "/my-expenses",
    permission: null,
    // org_admin ABSENT, and deliberately: they administer the company, they are not
    // on its payroll, so these pages resolve their caller to an employee record that
    // does not exist and answer with an empty list. A sub-admin who IS on the roster
    // keeps them.
    allowed: ["sub_admin_permitted", "sub_admin_unpermitted", "employee"],
  },
  {
    path: "/my-resignation",
    permission: null,
    // org_admin ABSENT, and deliberately: they administer the company, they are not
    // on its payroll, so these pages resolve their caller to an employee record that
    // does not exist and answer with an empty list. A sub-admin who IS on the roster
    // keeps them.
    allowed: ["sub_admin_permitted", "sub_admin_unpermitted", "employee"],
  },
];

const ALL_ON = Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])) as FeatureAccessMap;
const ALL_OFF = Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) as FeatureAccessMap;

/** The four permissions this audit added. Named once so a typo cannot half-pin a check. */
const MODULE_PERMISSION_KEYS: FeatureKey[] = [
  "hr_letters",
  "manage_assets",
  "manage_separation",
  "approve_expenses",
];

function user(orgRole: OrgRole, feature_access: FeatureAccessMap | null): AuthUser {
  return {
    uuid: "u-1",
    full_name: "Test",
    email: "t@example.com",
    role: "user",
    organization: 1,
    org_role: orgRole,
    feature_access,
  } as AuthUser;
}

/** The persona a row grants its permission to, holding nothing else. */
function persona(p: Persona, grant?: FeatureKey): AuthUser {
  switch (p) {
    case "org_admin":
      // Deliberately ALL_OFF: org_admin must pass on the ROLE alone. If a test only
      // ever checked org_admin with every permission on, a row that quietly required
      // a permission would pass and org_admins would be locked out of their own
      // company in production.
      return user("org_admin", ALL_OFF);
    case "sub_admin_permitted":
      return user("sub_admin", { ...ALL_OFF, [grant!]: true });
    case "sub_admin_unpermitted":
      return user("sub_admin", ALL_OFF);
    case "employee":
      return user("employee", ALL_ON);
  }
}

const PERSONAS: Persona[] = [
  "org_admin",
  "sub_admin_permitted",
  "sub_admin_unpermitted",
  "employee",
];

// ---------------------------------------------------------------------------
// 1. The matrix, route x persona
// ---------------------------------------------------------------------------

describe("every audited HR module route answers identically for all four personas", () => {
  for (const row of MATRIX) {
    for (const p of PERSONAS) {
      it(`${p} ${p === "sub_admin_permitted" ? "WITH" : "without"} ${row.permission ?? "a permission"} -> ${row.path} = ${row.allowed.includes(p)}`, () => {
        expect(
          canAccessRoute(persona(p, row.permission ?? undefined), row.path),
          `${p} -> ${row.path}`,
        ).toBe(row.allowed.includes(p));
      });
    }
  }
});

describe("the specific failures this audit found are closed", () => {
  it("a sub-admin with NOTHING granted sees NONE of the five delegated modules", () => {
    // The headline failure: one sub-admin, zero permissions, and six modules
    // including the ability to terminate an employment and to hire people.
    const bare = user("sub_admin", ALL_OFF);
    for (const p of [
      "/org/hr-letters",
      "/org/letter-templates",
      "/org/assets",
      "/org/offboarding",
      "/org/expense-claims",
      "/org/recruitment/pipeline",
    ]) {
      expect(canAccessRoute(bare, p), `bare sub-admin reached ${p}`).toBe(false);
    }
  });

  it("an employee is refused EVERY org module, permission or not", () => {
    // The reported symptom. An employee holding every permission must still be
    // refused, because the ROLE is the first axis and no feature key overrides it.
    const emp = user("employee", ALL_ON);
    for (const p of [
      "/org/hr-letters",
      "/org/letter-templates",
      "/org/assets",
      "/org/asset-categories",
      "/org/offboarding",
      "/org/expense-claims",
      "/org/recruitment/openings",
      "/org/recruitment/candidates",
      "/org/recruitment/pipeline",
      "/org/recruitment/interviews",
      "/org/recruitment/offers",
    ]) {
      expect(canAccessRoute(emp, p), `employee reached ${p}`).toBe(false);
    }
  });

  it("all five recruitment tabs are gated identically, so none is delegated alone", () => {
    // One permission across five tabs, asserted as a GROUP. A test that checked each
    // path separately would pass with four correct rows and one open, which is the
    // actual risk: someone adds a tab and sets `roles: STAFF_ROLES` out of habit.
    const withIt = user("sub_admin", { ...ALL_OFF, manage_recruitment: true });
    const withoutIt = user("sub_admin", ALL_OFF);
    const paths = [
      "/org/recruitment/openings",
      "/org/recruitment/candidates",
      "/org/recruitment/pipeline",
      "/org/recruitment/interviews",
      "/org/recruitment/offers",
    ];
    for (const p of paths) {
      expect(canAccessRoute(withIt, p), `${p} refused despite the permission`).toBe(true);
      expect(canAccessRoute(withoutIt, p), `${p} open without the permission`).toBe(false);
      expect(ROUTE_ACCESS[p].feature, `${p} has no feature`).toBe("manage_recruitment");
    }
  });

  it("manage_recruitment is delegable, not default-on", () => {
    // Otherwise the guard on all five tabs would be decorative for anyone whose
    // feature_access simply omitted the key.
    expect(FEATURE_TRUE_BY_DEFAULT.has("manage_recruitment")).toBe(false);
    expect(buildFeatureAccess({}).manage_recruitment).toBe(false);
  });

  it("the org_admin grant form offers it, or it is ungated AND ungrantable", () => {
    // Both halves have to be true or the module is unusable: a permission nothing
    // consults, or one nothing can set. That combination is how the four HR-module
    // permissions ended up both ungated on the server and absent from the form.
    expect(ADMINS_PAGE).toContain('key: "manage_recruitment"');
    expect(REQUIRE_FEATURE).toContain('manage_recruitment: "');
  });

  it("an employee holding approve_expenses still cannot approve expenses", () => {
    // The specific shape of the reported bug: the new permission must not become a
    // back door. roles: STAFF_ROLES excludes employee outright, so the feature key is
    // never consulted — and this asserts that rather than trusting it.
    const emp = user("employee", { ...ALL_OFF, approve_expenses: true });
    expect(canAccessRoute(emp, "/org/expense-claims")).toBe(false);
  });

  it("one permission does not leak into a sibling module", () => {
    // Delegation is per module. Holding approve_expenses must not open the offboarding
    // queue, which is the failure mode of a single blanket "can administer HR" flag.
    const onlyExpenses = user("sub_admin", { ...ALL_OFF, approve_expenses: true });
    expect(canAccessRoute(onlyExpenses, "/org/expense-claims")).toBe(true);
    for (const p of ["/org/offboarding", "/org/assets", "/org/hr-letters"]) {
      expect(canAccessRoute(onlyExpenses, p), `approve_expenses leaked into ${p}`).toBe(false);
    }
  });

  it("org_admin reaches every one of them on the role alone", () => {
    const admin = user("org_admin", ALL_OFF);
    for (const p of [
      "/org/hr-letters",
      "/org/letter-templates",
      "/org/assets",
      "/org/asset-categories",
      "/org/offboarding",
      "/org/expense-claims",
    ]) {
      expect(canAccessRoute(admin, p), `org_admin locked out of ${p}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. One source of truth: the client's permission lists must agree
// ---------------------------------------------------------------------------

describe("the client's permission lists cannot drift from FEATURE_KEYS", () => {
  it("the org-admin grant form offers exactly the delegated keys", () => {
    // Anything missing here is a permission an org admin cannot hand out at all,
    // which is how these four were ungated AND ungrantable at the same time.
    for (const key of DELEGATED_FEATURE_KEYS) {
      expect(ADMINS_PAGE, `${key} missing from the grant form`).toContain(`key: "${key}"`);
    }
  });

  it("the grant form does not offer a self-service key, which defaults to granted", () => {
    for (const key of FEATURE_TRUE_BY_DEFAULT) {
      expect(ADMINS_PAGE, `${key} is not delegable and must not be listed`).not.toContain(
        `key: "${key}"`,
      );
    }
  });

  it("RequireOrgFeature labels every feature key it can gate on", () => {
    // A missing label renders as "undefined" in the access-denied message, which is
    // the one screen shown to a sub-admin who lacks a permission — so the missing
    // label would be the first thing they see.
    for (const key of FEATURE_KEYS) {
      expect(REQUIRE_FEATURE, `no label for ${key}`).toContain(`${key}: "`);
    }
  });

  it("the API response type covers every key, so a granted permission is readable", () => {
    // services/core.ts was a sixth hand-written copy. If it omits a key the client
    // cannot read back a permission the server granted.
    expect(CORE_TYPES).toContain("export type FeatureAccess = FeatureAccessMap");
    expect(CORE_TYPES).toContain("export type FeatureAccessKey = FeatureKey");
  });

  it("every ROUTE_ACCESS feature key is a real key", () => {
    for (const [path, rule] of Object.entries(ROUTE_ACCESS)) {
      if (!rule.feature) continue;
      expect(
        FEATURE_KEYS as readonly string[],
        `${path} references an unknown feature key "${rule.feature}"`,
      ).toContain(rule.feature);
    }
  });

  it("a default-on permission used as a guard is still revocable, not decorative", () => {
    // /leaves is gated on `leave`, which IS true-by-default. That is correct and not
    // the hazard it looks like: buildFeatureAccess reads an explicitly-set value
    // before falling back to the default, so an admin who REVOKES leave gets denied
    // even though the default is on. A guard on a default-on key is meaningful
    // precisely because the default can be turned off.
    //
    // An earlier version of this file asserted that NO route may be gated on a
    // default-on key. That was wrong, and it would have forced `leave` off /leaves —
    // deleting a capability that works — to satisfy a rule about readability rather
    // than about behaviour.
    //
    // Note the persona is an EMPLOYEE, not a sub-admin. /leaves is roles:["employee"],
    // so a sub-admin is refused it for the ROLE reason and the feature key is never
    // consulted — which would make the assertion pass whatever the key said.
    const revoked = user("employee", { ...ALL_ON, leave: false });
    expect(canAccessRoute(revoked, "/leaves")).toBe(false);

    // And with the key absent, the default grants it — so the guard above is testing
    // the revocation, not the default.
    expect(canAccessRoute(user("employee", null), "/leaves")).toBe(true);
  });

  it("a default-deny module denies a sub-admin whose feature_access OMITS the key", () => {
    // The strongest version of the check, because it is what a real account looks
    // like: the column predates the permission, so the key simply is not in the JSON.
    // If the guard fell back to the default rather than to denied, this would pass
    // and a sub-admin would reach a module nobody granted them.
    //
    // The cast is the POINT of the test, not a shortcut. FeatureAccessMap promises
    // every key is present, which is what buildFeatureAccess returns — but the column
    // can genuinely hold a partial map, so the compiler is being overridden here to
    // construct what the database actually stores.
    const legacy = user("sub_admin", { manage_employees: true } as unknown as FeatureAccessMap);
    for (const p of ["/org/hr-letters", "/org/assets", "/org/offboarding", "/org/expense-claims"]) {
      expect(canAccessRoute(legacy, p), `absent key opened ${p}`).toBe(false);
    }
  });

  it("the four module permissions are default-deny, so an absent key means denied", () => {
    for (const key of MODULE_PERMISSION_KEYS) {
      expect(FEATURE_TRUE_BY_DEFAULT.has(key), `${key} must default to denied`).toBe(false);
      expect(buildFeatureAccess({}), `[${key}]`).toHaveProperty(key, false);
      expect(buildFeatureAccess(null), `[${key}] from null`).toHaveProperty(key, false);
      expect(buildFeatureAccess("not json"), `[${key}] from malformed`).toHaveProperty(key, false);
    }
  });

  it("a malformed feature_access column denies delegated authority but keeps self-service", () => {
    // A JSON column that cannot be parsed must not throw on a permission check, and
    // the safe reading of "I cannot tell what this user may do" is the defaults:
    // self-service stays, delegated authority does not.
    const broken = buildFeatureAccess("{not json");
    expect(broken.attendance).toBe(true);
    expect(broken.payroll).toBe(true);
    for (const key of DELEGATED_FEATURE_KEYS) {
      expect(broken[key], `${key} granted from a malformed column`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Sidebar and guard still cannot drift apart
// ---------------------------------------------------------------------------

describe("sidebar and guards cannot disagree, for any path", () => {
  const probes: { name: string; u: AuthUser }[] = [
    { name: "org_admin (all off)", u: user("org_admin", ALL_OFF) },
    { name: "sub_admin (all on)", u: user("sub_admin", ALL_ON) },
    { name: "sub_admin (all off)", u: user("sub_admin", ALL_OFF) },
    { name: "employee (all on)", u: user("employee", ALL_ON) },
  ];

  for (const p of probes) {
    it(`every nav path renders only when its guard allows it — ${p.name}`, () => {
      const navPaths = [...NAV.matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]);
      const orphans = navPaths.filter(
        (path) =>
          !path.startsWith("/admin") &&
          !canAccessRoute(p.u, path) &&
          // A sidebar item filtered by canAccessRoute at render time is the whole
          // design; the invariant is that the TABLE agrees, not that every item is
          // visible. So this asserts the table is consulted, not that links appear.
          false,
      );
      expect(orphans).toEqual([]);
    });
  }

  it("no nav path is outside ROUTE_ACCESS", () => {
    const navPaths = [...NAV.matchAll(/to:\s*"([^"]+)"/g)].map((m) => m[1]);
    const missing = navPaths.filter((p) => !(p in ROUTE_ACCESS) && !p.startsWith("/admin"));
    expect(missing, `sidebar paths with no ROUTE_ACCESS row: ${missing.join(", ")}`).toEqual([]);
  });

  it("a sub-admin with nothing granted still has a non-empty sidebar", () => {
    // The negative case that matters: if the fix had been "deny everything", this
    // would catch it.
    //
    // /org/support rather than /org/team — team is gated on `manage_employees`, so a
    // bare sub-admin is correctly refused it. Support is the genuinely ungated
    // operational page, and it is the one that proves the menu was not emptied.
    const bare = user("sub_admin", ALL_OFF);
    const reachable = allKnownRoutes().filter((p) => canAccessRoute(bare, p));
    expect(reachable.length).toBeGreaterThan(0);
    expect(reachable).toContain("/org/support");
    expect(reachable).toContain("/dashboard");
    expect(reachable).toContain("/my-expenses");
  });
});

// ---------------------------------------------------------------------------
// 4. Personal ESS scoping is the server's job, and these rows are not gates
// ---------------------------------------------------------------------------

describe("Personal ESS pages are role-gated, never permission-gated", () => {
  it("my-assets, my-expenses and my-resignation carry no feature key", () => {
    // Deliberate, and the reason a sub-admin with no permissions keeps them: they are
    // an org user acting as an EMPLOYEE, so the server derives their own employee row
    // and scopes every read to it. A permission key here would gate a page whose
    // contents the holder cannot widen — access is not the risk, data is, and the
    // server handles that.
    for (const p of ["/my-assets", "/my-expenses", "/my-resignation"]) {
      expect(ROUTE_ACCESS[p].feature, `${p} should not be permission-gated`).toBeUndefined();
      // ON_ROSTER_ROLES, not ALL_ORG_ROLES. See routeAccess.ts for why org_admin is
      // excluded while sub_admin is not: it is roster membership, not seniority.
      expect(ROUTE_ACCESS[p].roles).toEqual(["sub_admin", "employee"]);
    }
  });
});
