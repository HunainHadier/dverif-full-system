import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SidebarInner } from "@/components/layout/AppShell";
import { accountItemsFor, primaryNavItemsFor } from "@/lib/navItems";
import { canAccessRoute } from "@/lib/routeAccess";
import { ROUTE_MODULES } from "@/lib/routeModules";
import type { AuthUser } from "@/lib/auth";
import { FEATURE_KEYS, type FeatureAccessMap } from "@/lib/featureKeys";

/**
 * WHAT AN ORG ADMIN ACTUALLY SEES IN THE SIDEBAR.
 *
 * lib/sidebarRoles.test.ts pins which LINKS the composition returns. This file
 * renders the real sidebar and asserts on the DOM, which catches a different
 * class of regression: someone editing AppShell and putting a personal item back
 * into the primary <ul> would leave every composition test green while undoing
 * the whole change. Rendering is the only way to see the actual menu.
 *
 * Assertions are on RENDERED TEXT, following the rule the global test setup
 * spells out: i18next renders a missing key as the raw key string, so asserting
 * on text is what catches a label that was never translated.
 *
 * `Link` is mocked to a plain anchor. SidebarInner is a leaf that only renders
 * navigation, and mounting a real TanStack router to satisfy it would test the
 * router rather than the sidebar.
 */
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    className,
    onClick,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
  }) => (
    <a href={to} data-testid={`link-${to}`} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

/** The plan picker is a no-op default here; the plan-lock tests assert on its spy. */
const { openPicker } = vi.hoisted(() => ({ openPicker: vi.fn() }));

vi.mock("@/components/common/PlanPickerProvider", () => ({
  PlanPickerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePlanPicker: () => ({ openPicker }),
}));

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
/** A platform admin: the account group is empty for them, so no toggle renders. */
const platformAdminUser = () =>
  user({ role: "admin", org_role: undefined, feature_access: allFeatures });

/**
 * Render the sidebar the way AppShell does: compose the items, then AND with
 * canAccessRoute exactly as the component does. Duplicating the composition here
 * rather than importing it would hide a bug in the composition itself, so it is
 * imported -- only the access filter, which is the caller's job, is repeated.
 */
function renderSidebarFor(u: AuthUser) {
  const primary = primaryNavItemsFor(u.org_role).filter((it) => canAccessRoute(u, it.to));
  // Composed the way AppShell composes it, including the platform-admin exclusion.
  const account =
    u.role === "admin" ? [] : accountItemsFor(u).filter((it) => canAccessRoute(u, it.to));

  return render(
    <SidebarInner
      items={primary}
      accountItems={account}
      pathname="/dashboard"
      onNavigate={() => {}}
      onLogout={() => {}}
      locked={false}
      moduleOffPaths={new Set()}
      blanketLockedPaths={new Set()}
      pathModule={{}}
    />,
  );
}

/**
 * The same sidebar, but with the given paths reporting a module the current
 * plan excludes. This is the state a Free-plan org is in for every module it
 * has not bought, and the behaviour under test is what the menu offers when a
 * link would otherwise lead to a page showing only a lock card.
 */
function renderSidebarWithPlanLocks(u: AuthUser, lockedPaths: string[]) {
  const primary = primaryNavItemsFor(u.org_role).filter((it) => canAccessRoute(u, it.to));
  const account =
    u.role === "admin" ? [] : accountItemsFor(u).filter((it) => canAccessRoute(u, it.to));

  return render(
    <SidebarInner
      items={primary}
      accountItems={account}
      pathname="/dashboard"
      onNavigate={() => {}}
      onLogout={() => {}}
      locked={false}
      moduleOffPaths={new Set(lockedPaths)}
      blanketLockedPaths={new Set()}
      pathModule={ROUTE_MODULES}
    />,
  );
}

/** The primary nav is the <nav> element; the footer groups sit outside it. */
function primaryNav() {
  return screen.getByRole("navigation");
}

/**
 * Pages that need an employee record of their own, so they cannot appear in a staff
 * member's menu.
 *
 * /my-assets, /my-expenses and /my-resignation resolve the caller to an employee row;
 * `callerEmployee` returns null for an org_admin and the handler answers with an EMPTY
 * list rather than a 403. /requests is here only because it is the assertion's subject
 * below — it needs no employee record and IS shown to everyone.
 */
const ROSTER_ONLY_PATHS = ["/my-assets", "/my-expenses", "/my-resignation"];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the org_admin sidebar renders management modules only", () => {
  it("shows every operational module as a link", () => {
    renderSidebarFor(orgAdmin);
    const nav = primaryNav();
    for (const p of [
      "/org/team",
      "/org/leaves",
      "/org/payroll",
      "/org/expense-claims",
      "/org/assets",
      "/org/offboarding",
      "/org/hr-letters",
    ]) {
      expect(within(nav).getByTestId(`link-${p}`), `${p} not rendered`).toBeInTheDocument();
    }
  });

  it("shows NO personal employee link in the primary nav", () => {
    renderSidebarFor(orgAdmin);
    const nav = primaryNav();
    for (const p of ROSTER_ONLY_PATHS) {
      expect(within(nav).queryByTestId(`link-${p}`), `${p} is in the primary nav`).toBeNull();
    }
  });

  it("shows My Requests in the primary nav, plainly and not in a dropdown", async () => {
    renderSidebarFor(orgAdmin);
    // A manager who works the verification QUEUE also has a request of their own to
    // raise, and there is no Personal ESS group any more to hold it. So this is a plain
    // link in the menu, for every role.
    expect(within(primaryNav()).getByTestId("link-/requests")).toBeInTheDocument();
    // And it is not hiding behind a toggle.
    expect(screen.queryByRole("button", { name: /personal ess/i })).toBeNull();
  });

  it("keeps the approval worklists, which are the job and not personal", () => {
    renderSidebarFor(orgAdmin);
    const nav = primaryNav();
    expect(within(nav).getByTestId("link-/inbox")).toBeInTheDocument();
    expect(within(nav).getByTestId("link-/auto-verified")).toBeInTheDocument();
  });

  it("renders human labels, not raw translation keys", () => {
    renderSidebarFor(orgAdmin);
    // A missing key renders as "nav.expenseClaims" on screen. Asserting on the
    // rendered text is the only way to catch it, and a raw key on the sidebar is
    // the most visible possible translation bug.
    const nav = primaryNav();
    expect(within(nav).getByText("Expense Claims")).toBeInTheDocument();
    expect(within(nav).getByText("Assets")).toBeInTheDocument();
    expect(within(nav).queryByText(/^nav\./)).toBeNull();
  });

  it("offers no Personal ESS toggle, because the group was removed", () => {
    renderSidebarFor(orgAdmin);
    // The group is gone rather than emptied: /my-assets, /my-expenses and
    // /my-resignation need an employee record an org_admin does not have, and
    // /requests now sits in the primary menu. An empty collapsible group would be a
    // heading that opens onto nothing.
    expect(screen.queryByRole("button", { name: /personal ess/i })).toBeNull();
  });
});

describe("the account group renders its own links and collapses like the others", () => {
  it("is collapsed by default, so its links stay out of the menu until asked for", () => {
    renderSidebarFor(orgAdmin);
    const toggle = screen.getByRole("button", { name: /account/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Nothing rendered while collapsed.
    expect(screen.queryByTestId("link-/settings")).toBeNull();
    expect(screen.queryByTestId("link-/payments")).toBeNull();
    expect(screen.queryByTestId("link-/org/support")).toBeNull();
  });

  it("gives an org_admin Settings, Payments and Support", async () => {
    const user_ = userEvent.setup();
    renderSidebarFor(orgAdmin);
    await user_.click(screen.getByRole("button", { name: /account/i }));

    for (const p of ["/settings", "/payments", "/org/support"]) {
      expect(
        screen.getByTestId(`link-${p}`),
        `${p} missing from the account group`,
      ).toBeInTheDocument();
    }
  });

  it("expands on click, and nothing else opens with it", async () => {
    // There is no second collapsible group any more, so this asserts the account
    // toggle is self-contained rather than coordinated with anything.
    const user_ = userEvent.setup();
    renderSidebarFor(orgAdmin);

    await user_.click(screen.getByRole("button", { name: /account/i }));
    expect(screen.getByRole("button", { name: /account/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByTestId("link-/settings")).toBeInTheDocument();

    await user_.click(screen.getByRole("button", { name: /account/i }));
    expect(screen.getByRole("button", { name: /account/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByTestId("link-/settings")).toBeNull();
  });

  it("renders Settings and Support for an EMPLOYEE, but not /payments", async () => {
    const user_ = userEvent.setup();
    renderSidebarFor(employee);
    await user_.click(screen.getByRole("button", { name: /account/i }));

    expect(screen.getByTestId("link-/settings")).toBeInTheDocument();
    // Employees raise tier-1 support tickets to their organization admin.
    expect(screen.getByTestId("link-/org/support")).toBeInTheDocument();
    // /payments remains org_admin-only; showing it would advertise a bouncing page.
    expect(screen.queryByTestId("link-/payments")).toBeNull();
  });

  it("shows no account group at all when the role has nothing in it", () => {
    // An employee DOES get Settings, so the empty case is covered by a platform admin
    // in the other suite. This pins the other half: the group heading is not rendered
    // for a role whose list is empty, because a toggle that opens onto nothing is worse
    // than no toggle.
    renderSidebarFor(platformAdminUser());
    expect(screen.queryByRole("button", { name: /^account$/i })).toBeNull();
  });

  it("keeps the sign-out control below it, so expanding never hides it", async () => {
    const user_ = userEvent.setup();
    renderSidebarFor(orgAdmin);
    // nav.signOut is "Logout", not "Sign out".
    await user_.click(screen.getByRole("button", { name: /account/i }));
    expect(screen.getByRole("button", { name: /logout/i })).toBeInTheDocument();
  });

  it("shows neither /settings nor /org/support in the PRIMARY nav any more", () => {
    // They moved into the group. Rendered twice in one sidebar is the clutter the
    // Personal ESS split was made to remove, and this is where it would come back.
    renderSidebarFor(orgAdmin);
    const nav = primaryNav();
    for (const p of ["/settings", "/payments", "/org/support"]) {
      expect(within(nav).queryByTestId(`link-${p}`), `${p} still in the primary nav`).toBeNull();
    }
  });
});

/**
 * A PLAN IS A SECOND AXIS, SEPARATE FROM ROLE.
 *
 * The complaint that prompted these tests: some modules excluded by the plan
 * showed an "Upgrade" badge in the sidebar, while others opened their page and
 * only then showed the lock card. Nothing was insecure -- every page gates
 * itself -- but the same situation looked like two different bugs depending on
 * which link the user happened to click. The badge must be offered for every
 * gated link, not the subset that happened to be listed in AppShell.
 */
describe("plan-locked modules are offered where the user meets them", () => {
  const orgPaths = Object.keys(ROUTE_MODULES).filter((p) => p.startsWith("/org/"));
  const selfServicePaths = Object.keys(ROUTE_MODULES).filter((p) => !p.startsWith("/org/"));

  it("badges EVERY gated management link for an org_admin", () => {
    renderSidebarWithPlanLocks(orgAdmin, orgPaths);
    const nav = primaryNav();
    for (const p of orgPaths) {
      const link = within(nav).getByTestId(`link-${p}`);
      expect(within(link).getByText("Upgrade"), `${p} has no upgrade badge`).toBeInTheDocument();
    }
  });

  it("badges EVERY gated self-service link for an employee", () => {
    renderSidebarWithPlanLocks(employee, selfServicePaths);
    const nav = primaryNav();
    for (const p of selfServicePaths) {
      const link = within(nav).getByTestId(`link-${p}`);
      expect(within(link).getByText("Upgrade"), `${p} has no upgrade badge`).toBeInTheDocument();
    }
  });

  it("opens the plan chooser for the link's module instead of navigating", async () => {
    const user_ = userEvent.setup();
    renderSidebarWithPlanLocks(orgAdmin, ["/org/assets"]);

    await user_.click(within(primaryNav()).getByTestId("link-/org/assets"));

    expect(openPicker).toHaveBeenCalledWith("asset_management");
  });
});
