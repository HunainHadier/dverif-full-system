import { describe, it, expect } from "vitest";

import {
  allNavPaths,
  isStaffOrgRole,
  accountItemsFor,
  accountNavItems,
  primaryNavItemsFor,
  memberNavItems,
  orgAdminNavItems,
  userNavItems,
  type NavItem,
} from "@/lib/navItems";
import { canAccessRoute, ROUTE_ACCESS } from "@/lib/routeAccess";
import type { AuthUser } from "@/lib/auth";
import { FEATURE_KEYS, type FeatureAccessMap } from "@/lib/featureKeys";

/**
 * The sidebar's ROLE SEPARATION, and the line it must not cross.
 *
 * THE BUG THIS EXISTS FOR. An org_admin's primary menu listed their own laptop,
 * their own taxi claims and their own resignation notice at the same weight as
 * Payroll, Asset Categories and the org's expense review queue -- six personal
 * links in a twenty-item management menu, none of which a person running the
 * company opened to do their job. Nothing was broken and nothing was insecure.
 * The menu simply was not doing its one job.
 *
 * THE LINE, STATED ONCE:
 *
 *   audience chooses the MENU.     Presentation. Decided here, in navItems.
 *   canAccessRoute decides ACCESS.  Security. Decided in routeAccess, enforced by
 *                                  the API independently.
 *
 * Everything below follows from that. Narrowing the menu is safe; narrowing
 * access is NOT, and most of these tests exist to prove the change did not quietly
 * become the second thing. The server mounts /my-assets, /my-expenses and
 * /my-resignation behind authUser with NO role check, so an org_admin holding a
 * company laptop genuinely can file for their own taxi. Hiding those pages from
 * them in the client while the server keeps serving them would be the app
 * disagreeing with the API about what is true -- and the "Personal ESS" group
 * exists precisely so the pages stay one click away.
 */

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

/** Every feature granted, so nothing is hidden by a permission rather than by role. */
/**
 * Every feature granted, so a failure in these tests can only be about ROLE and never
 * about a permission that happens to be off.
 *
 * BUILT FROM THE KEY LIST rather than written out. A hand-written literal here failed
 * to compile the day a permission was added, producing a confusing "missing
 * properties" error in a test that had nothing wrong with it — and, worse, would
 * have kept compiling while silently testing a user with fewer permissions than the
 * test believed it was creating.
 */
const allFeatures: FeatureAccessMap = Object.fromEntries(
  FEATURE_KEYS.map((k) => [k, true]),
) as FeatureAccessMap;

const orgAdmin = user({ org_role: "org_admin", feature_access: allFeatures });
const staff = user({ org_role: "sub_admin", feature_access: allFeatures });
const employee = user({ org_role: "employee", feature_access: allFeatures });
/** Platform admin. Distinct from org_admin: no org, and the platform area's own menus. */
const platformAdmin = user({ role: "admin", org_role: undefined, feature_access: allFeatures });

const paths = (items: NavItem[]) => items.map((i) => i.to);

// ---------------------------------------------------------------------------
// Staff: management only
// ---------------------------------------------------------------------------

describe("staff primary menu is management only", () => {
  it.each([
    ["org_admin", orgAdmin],
    ["sub_admin", staff],
  ])("%s sees no ROSTER-ONLY link, because they have no employee record", (_role, u) => {
    const shown = paths(primaryNavItemsFor(u.org_role));
    // /my-assets, /my-expenses and /my-resignation resolve the caller to an employee
    // row, and a manager has none — `callerEmployee` returns null and the handler
    // answers with an EMPTY list rather than a 403. So these are not features for
    // them, and a link would promise a page they cannot populate.
    //
    // /requests is deliberately NOT in this list: it needs no employee record and is
    // shown to everyone now that the Personal ESS group is gone.
    for (const p of [
      "/my-assets",
      "/my-expenses",
      "/my-resignation",
      "/attendance",
      "/my-letters",
      "/payroll",
      "/leaves",
    ]) {
      expect(shown, `${p} is still in the management menu`).not.toContain(p);
    }
  });

  it.each([
    ["org_admin", orgAdmin],
    ["sub_admin", staff],
  ])("%s still sees every operational module", (_role, u) => {
    const shown = paths(primaryNavItemsFor(u.org_role));
    // The modules that ARE the job. Each is a management surface, so losing one
    // here would be a regression far worse than the clutter we removed.
    for (const p of [
      "/dashboard",
      "/org/team",
      "/org/admins",
      "/org/leaves",
      "/org/attendance",
      "/org/salary-components",
      "/org/payroll",
      "/org/expense-claims",
      "/org/asset-categories",
      "/org/assets",
      "/org/offboarding",
      "/org/hr-letters",
      "/org/letter-templates",
    ]) {
      expect(shown, `${p} vanished from the staff menu`).toContain(p);
    }

    // /org/support, /payments and /settings are NOT in that list because they are no
    // longer primary modules -- all three moved to the account group, where they read as
    // "your account and your subscription" rather than as work to be done. They are
    // asserted present in the account-group block below, which is where a regression
    // would now show up.
    for (const moved of ["/org/support", "/payments", "/settings"]) {
      expect(shown, `${moved} should have left the primary menu`).not.toContain(moved);
    }
  });

  it("keeps the approval worklists, which are staff work, AND their own requests", () => {
    const shown = paths(primaryNavItemsFor("org_admin"));
    // /inbox and /auto-verified are other people's requests waiting on this user: the
    // job.
    expect(shown).toContain("/inbox");
    expect(shown).toContain("/auto-verified");
    // /requests is now here too, and this is the change. It is still "my own request"
    // rather than the queue, but the Personal ESS group that used to hold it is gone,
    // so it is a plain menu link. A manager who works the queue also has paperwork of
    // their own to raise, and they should not have to know a dropdown existed to find
    // it.
    expect(shown).toContain("/requests");
  });

  it("puts the management modules in a sensible order, payroll before expenses", () => {
    const shown = paths(primaryNavItemsFor("org_admin"));
    // Money ops read in this order: payroll decides what is paid, expenses are
    // what gets reimbursed on top, assets is what was bought.
    expect(shown.indexOf("/org/payroll")).toBeLessThan(shown.indexOf("/org/expense-claims"));
    expect(shown.indexOf("/org/expense-claims")).toBeLessThan(shown.indexOf("/org/assets"));
    expect(shown.indexOf("/org/assets")).toBeLessThan(shown.indexOf("/org/offboarding"));
  });
});

// ---------------------------------------------------------------------------
// Employee: self-service only
// ---------------------------------------------------------------------------

describe("employee menu is self-service only", () => {
  it("shows the employee pages and none of the org ones", () => {
    const shown = paths(primaryNavItemsFor("employee"));
    for (const p of [
      "/my-assets",
      "/my-expenses",
      "/my-resignation",
      "/requests",
      "/attendance",
      "/my-letters",
      "/payroll",
    ]) {
      expect(shown, `${p} missing from the employee menu`).toContain(p);
    }
    for (const p of orgAdminNavItems.map((i) => i.to)) {
      expect(shown, `${p} leaked into the employee menu`).not.toContain(p);
    }
  });

  it("still gets the dashboard, because it is their landing page", () => {
    expect(paths(primaryNavItemsFor("employee"))).toContain("/dashboard");
  });

  it("no longer gets Settings in the MIDDLE, because it moved to the account group", () => {
    // Settings is an account link now, not a module. Its reachability is unchanged and
    // is asserted against `accountItemsFor` below; what this pins is that it is not
    // listed TWICE, which is the failure a move like this normally causes.
    expect(paths(primaryNavItemsFor("employee"))).not.toContain("/settings");
    expect(paths(primaryNavItemsFor("org_admin"))).not.toContain("/settings");
    // Still reachable for every org role — a page must not be lost by being regrouped.
    expect(canAccessRoute(employee, "/settings")).toBe(true);
    expect(canAccessRoute(orgAdmin, "/settings")).toBe(true);
  });

  it("shows no employee the org approval worklists", () => {
    // Already refused by canAccessRoute (roles: STAFF_ROLES / feature-gated), and
    // the audience split now keeps them out of the menu a second time.
    const shown = paths(primaryNavItemsFor("employee"));
    expect(shown).not.toContain("/inbox");
    expect(shown).not.toContain("/auto-verified");
  });
});

// ---------------------------------------------------------------------------
// The escape hatch, and the line it must not cross
// ---------------------------------------------------------------------------

describe("separation hides, it does not delete", () => {
  it("every nav path is either reachable from a menu or refused by the guard", () => {
    // The union of a staff member's THREE menus now, plus the employee's two. The
    // alternative reading -- "staff must reach everything" -- is
    // wrong: /leaves is employee-only on the server, so a staff member is CORRECTLY
    // unable to open it and no menu should pretend otherwise. What must never happen
    // is a path that is reachable but appears in no menu: the page would work
    // by URL and simply be unfindable.
    //
    // The account group is in BOTH sets because /settings is in it, and /settings is
    // reachable by an employee and an org_admin alike. Leaving the account group out of
    // the employee side is exactly how the first version of this move left /settings
    // reachable by URL with no menu anywhere pointing at it.
    const staffReach = new Set([
      ...paths(primaryNavItemsFor("org_admin")),
      ...paths(accountItemsFor(orgAdmin)),
    ]);
    const employeeReach = new Set([
      ...paths(primaryNavItemsFor("employee")),
      ...paths(accountItemsFor(employee)),
    ]);
    const unreachable = allNavPaths.filter(
      (p) =>
        !p.startsWith("/admin") &&
        !staffReach.has(p) &&
        !employeeReach.has(p) &&
        canAccessRoute(orgAdmin, p) &&
        canAccessRoute(employee, p),
    );
    expect(unreachable, `reachable by guard but in no menu: ${unreachable.join(", ")}`).toEqual([]);
  });

  it("an employee's single menu still covers every self-service path they can open", () => {
    const shown = new Set(paths(primaryNavItemsFor("employee")));
    const selfService = [...userNavItems, ...memberNavItems]
      .filter((i) => i.audience === "self-service")
      .map((i) => i.to);
    expect(selfService.length).toBeGreaterThan(0);
    for (const p of selfService) {
      // canAccessRoute is the reference here, because an employee is refused the
      // feature-gated ones (/requests without generate_request) and asserting them
      // unconditionally would describe a user the product does not have.
      if (canAccessRoute(employee, p)) {
        expect(shown.has(p), `${p} missing for an employee`).toBe(true);
      }
    }
  });

  it("isStaffOrgRole treats only the two staff roles as staff", () => {
    expect(isStaffOrgRole("org_admin")).toBe(true);
    expect(isStaffOrgRole("sub_admin")).toBe(true);
    expect(isStaffOrgRole("employee")).toBe(false);
    expect(isStaffOrgRole(undefined)).toBe(false);
    expect(isStaffOrgRole(null)).toBe(false);
  });

  it("an item with no audience is management, so a new module defaults sensibly", () => {
    // The default is the safe one: a newly added operational page appearing in the
    // staff menu is correct, and appearing in an employee's menu would be a leak.
    // /dashboard is excluded because it is deliberately cross-cutting.
    const untagged = [...userNavItems, ...memberNavItems, ...orgAdminNavItems].filter(
      (i) => i.audience === undefined && i.to !== "/dashboard",
    );
    expect(untagged.length).toBeGreaterThan(0);
    const shown = new Set(paths(primaryNavItemsFor("employee")));
    for (const it of untagged) {
      expect(shown.has(it.to), `untagged ${it.to} leaked into the employee menu`).toBe(false);
      expect(paths(primaryNavItemsFor("org_admin"))).toContain(it.to);
    }
  });

  it("orgAdminNavItems carries no self-service item by accident", () => {
    for (const it of orgAdminNavItems) {
      expect(it.audience, `${it.to} is tagged self-service inside the org list`).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// The account group: Settings, Payments, Support
// ---------------------------------------------------------------------------

describe("the account group holds settings, payments and support", () => {
  it("an org_admin gets all three", () => {
    // The org_admin administers the company, so all three are genuinely theirs:
    // their configuration, their subscription, and where they report a problem.
    expect(paths(accountItemsFor(orgAdmin))).toEqual(["/settings", "/payments", "/org/support"]);
  });

  it("a sub_admin gets Settings and Support but NOT Payments", () => {
    // /payments is org_admin-only in ROUTE_ACCESS, and an offer link a sub_admin
    // cannot open is a link that bounces. Support is STAFF_ROLES, so it stays.
    expect(paths(accountItemsFor(staff))).toEqual(["/settings", "/org/support"]);
  });

  it("an employee gets Settings alone, and the other two would bounce", () => {
    // /payments is org_admin-only and /org/support is staff-only. Offering an employee
    // either would advertise a page the guard refuses, which is the dead-link failure
    // this group exists to avoid.
    expect(paths(accountItemsFor(employee))).toEqual(["/settings"]);
  });

  it("a platform admin gets none: the platform area carries its own Settings", () => {
    expect(paths(accountItemsFor(platformAdmin))).toEqual([]);
  });

  it("a signed-out visitor gets none", () => {
    expect(accountItemsFor(null)).toEqual([]);
    expect(accountItemsFor(undefined)).toEqual([]);
  });

  it("no logged-out or platform-admin case can throw on a missing org_role", () => {
    // accountItemsFor filters through canAccessRoute, which reads org_role. A user
    // object without one must produce an empty list rather than a crash on a route
    // that renders before auth has resolved.
    expect(paths(accountItemsFor({ ...orgAdmin, org_role: undefined }))).toEqual([]);
  });

  it("carries no path the group owner would be refused", () => {
    // Every offered link must open. An account group full of dead entries is worse than
    // no group, because a dead link reads as a broken product.
    for (const u of [orgAdmin, staff, employee]) {
      for (const it of accountItemsFor(u)) {
        expect(canAccessRoute(u, it.to), `${u.org_role} offered unreachable ${it.to}`).toBe(true);
      }
    }
  });

  it("its three paths are in NEITHER the primary menu nor any other group", () => {
    // The whole reason for the group. A page rendered twice in one sidebar is the
    // clutter the sidebar separation was made to remove, and this is where it would
    // come straight back. (Personal ESS is gone; there is no second group to collide
    // with, so the primary nav is the only place they must NOT appear.)
    const primary = new Set(paths(primaryNavItemsFor("org_admin")));
    const memberList = new Set(paths(memberNavItems));
    for (const p of ["/settings", "/payments", "/org/support"]) {
      expect(primary.has(p), `${p} duplicated in the primary menu`).toBe(false);
      expect(memberList.has(p), `${p} duplicated in a self-service list`).toBe(false);
      // …and still reachable, so nothing was lost in the move.
      expect(canAccessRoute(orgAdmin, p), `${p} became unreachable`).toBe(true);
    }
  });

  it("every account link is tagged `account`, so no primary filter can claim it", () => {
    // If one of these lost the tag it would default to "management" and reappear in
    // the middle of the menu — the exact regression this group was added to avoid, and
    // one that no rendering test would catch.
    for (const it of accountNavItems) {
      expect(it.audience, `${it.to} is not tagged account`).toBe("account");
    }
  });
});
