import type { LucideIcon } from "lucide-react";
import { canAccessRoute, type OrgRole } from "@/lib/routeAccess";
import type { AuthUser } from "@/lib/auth";
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CalendarClock,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FileSignature,
  FileText,
  FolderTree,
  Headset,
  History,
  Hourglass,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Package,
  Receipt,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";

/**
 * The sidebar's item lists, kept apart from the shell that renders them so the
 * nav can be checked against ROUTE_ACCESS in a test: every path declared here
 * must have a row in that table, otherwise the sidebar can render a link whose
 * guard denies it -- the exact class of bug this table was introduced to end.
 *
 * MAY this user open the page? That is decided SOLELY by canAccessRoute().
 *
 * SHOULD the page be one click away? That is the separate question this module's
 * `audience` field answers, and the two must not be confused -- see the note on
 * NavAudience below for why they came apart and why both still exist.
 */

/**
 * Which sidebar a link belongs in.
 *
 *  - "management" (the default when omitted) — operational work: payroll, assets,
 *    leave approvals, expense review. These belong in the primary sidebar for
 *    staff, because they are the job.
 *  - "self-service" — an employee acting as an employee: my payslips, my assets,
 *    my expenses, my resignation.
 *
 * WHY A SECOND AXIS AT ALL, GIVEN canAccessRoute ALREADY EXISTS.
 *
 * canAccessRoute answers a permission question. The complaint that prompted this
 * field was not that staff COULD open /my-expenses -- they must, the server mounts
 * it for every org user and denies nothing -- but that it sat in the middle of a
 * manager's primary menu beside Payroll and Asset Categories, among twenty
 * operational links, six of which are the employee acting for themselves. A
 * sub-admin running the company saw their own laptop and their own taxi receipt
 * filed at the same visual weight as the org's expense queue. Nothing was broken;
 * the menu was just not doing its one job.
 *
 * SO: audience NEVER removes access. Every self-service link stays in ROUTE_ACCESS
 * with whatever roles it had, and staff keep reaching them through the
 * "Personal ESS" affordance in the sidebar footer. Narrowing the PRIMARY menu is
 * a presentation decision; locking the page would be a security decision, and
 * that belongs to the server, which already made it.
 *
 * Marking something "self-service" is therefore always SAFE. Marking something
 * "management" is NOT free: it will appear for every staff member whose plan
 * includes its module, so only operational pages belong there.
 */
/**
 * WHICH SIDEBAR A LINK BELONGS IN.
 *
 * `management` and `self-service` are what `primaryNavItemsFor` switches on, and they
 * were the whole of the type until the account group. `account` is the third one and
 * it is NOT a peer of the other two: neither primary filter admits it, because a
 * Settings or Payments link is not part of a person's job at all. It is a marker so
 * `accountItemsFor` can recognise its own links and `primaryNavItemsFor` can decline
 * them, rather than a third destination the audience filter has to branch on.
 *
 * Keeping it in the same union rather than a parallel field means the compiler catches
 * a new link that claims an audience nobody handles — which is how `/org/support`
 * ended up listed in two places at once.
 */
export type NavAudience = "management" | "self-service" | "account";

export type NavItem = {
  to: string;
  labelKey: string;
  icon: LucideIcon;
  /** Omitted means "management". See NavAudience. */
  audience?: NavAudience;
  badge?: number;
};

/** Shared by org users of every role. */
export const userNavItems: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  // Self-service: this is the employee raising a request of their own, not the
  // approval queue (that is /inbox). It is ALL_ORG_ROLES in ROUTE_ACCESS because a
  // sub-admin raises verification requests too, so it is reachable for them --
  // just not from the middle of their management menu.
  { to: "/requests", labelKey: "nav.myRequests", icon: Send, audience: "self-service" },
  { to: "/leaves", labelKey: "nav.leaves", icon: CalendarDays, audience: "self-service" },
  // /inbox and /auto-verified are APPROVAL worklists. They stay management: a
  // reviewer opening their sidebar wants the queue first.
  { to: "/inbox", labelKey: "nav.inbox", icon: Inbox },
  { to: "/auto-verified", labelKey: "nav.autoVerified", icon: BadgeCheck },
];

/** Employee self-service. Staff reach these through the Personal ESS footer group. */
export const memberNavItems: NavItem[] = [
  { to: "/my-interviews", labelKey: "nav.myAssignedInterviews", icon: CalendarCheck, audience: "self-service" },
  { to: "/attendance", labelKey: "nav.attendance", icon: ClipboardCheck, audience: "self-service" },
  { to: "/my-letters", labelKey: "nav.myLetters", icon: FileSignature, audience: "self-service" },
  // Self-service, and NOT shown in a staff member's primary menu even though
  // ROUTE_ACCESS opens it to every org role: a sub-admin who is also on the roster
  // really is holding a company laptop and really can file for their own taxi.
  // They reach both through "Personal ESS" rather than having them crowd the
  // modules they administer.
  { to: "/my-assets", labelKey: "nav.myAssets", icon: Package, audience: "self-service" },
  { to: "/my-expenses", labelKey: "nav.myExpenses", icon: Receipt, audience: "self-service" },
  { to: "/payroll", labelKey: "nav.payroll", icon: Wallet, audience: "self-service" },
  { to: "/my-resignation", labelKey: "nav.myResignation", icon: LogOut, audience: "self-service" },
];

/** Org operations, for org_admin and (permission-gated) sub_admin. */
export const orgAdminNavItems: NavItem[] = [
  { to: "/org/team", labelKey: "nav.myTeam", icon: Users },
  { to: "/org/admins", labelKey: "nav.orgAdmins", icon: ShieldCheck },
  { to: "/org/leaves", labelKey: "nav.leaveRequests", icon: CalendarClock },
  { to: "/org/attendance", labelKey: "nav.attendance", icon: ClipboardCheck },
  { to: "/org/salary-components", labelKey: "nav.payrollComponents", icon: Wallet },
  { to: "/org/payroll", labelKey: "nav.payroll", icon: Wallet },
  { to: "/org/letter-templates", labelKey: "nav.letterTemplates", icon: FileText },
  { to: "/org/hr-letters", labelKey: "nav.hrLetters", icon: FileSignature },
  // Expense claims sit after payroll and before assets, because the money ops
  // read in that order: payroll decides what is paid, expense claims are what
  // reimburses on top of it, and assets is the register of what was bought.
  { to: "/org/expense-claims", labelKey: "nav.expenseClaims", icon: Receipt },
  // Asset categories sit before inventory because they are the filter the
  // inventory is read through, and because only an org_admin sees the first one.
  { to: "/org/asset-categories", labelKey: "nav.assetCategories", icon: FolderTree },
  { to: "/org/assets", labelKey: "nav.assets", icon: Package },
  // Offboarding sits after payroll because the FnF settlement is where the two
  // meet, and next to assets because the clearance checklist is what stands
  // between a departure and the company getting its laptop back.
  { to: "/org/offboarding", labelKey: "nav.offboarding", icon: LogOut },
  // Recruitment sits after Offboarding and before Support: it is the module that
  // ADDS to the roster, which is the last thing that happens to an employee record
  // before every other module starts operating on it.
  //
  // Only the pipeline board is linked. Openings, candidates, interviews and offers
  // are TABS of that one page, reached from it rather than from four separate
  // sidebar entries — four near-identical items in a menu that already carries
  // twenty is the clutter this module's siblings were just cleaned up for, and a
  // recruiter's day is one pipeline, not four destinations.
  { to: "/org/recruitment/pipeline", labelKey: "nav.recruitment", icon: UserPlus },
  // /org/support and /payments are NOT here: both moved into the account group
  // (accountNavItems) — support because it is where a person raises a ticket rather
  // than a queue they work through, and payments because it is the org's subscription
  // and not a module. Keeping either here would show the same page twice in one sidebar.
];

/** Platform admin (system) area. */
export const adminNav: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/admin/users", labelKey: "nav.users", icon: Users },
  { to: "/admin/organizations", labelKey: "nav.organizations", icon: Building2 },
  { to: "/admin/requests", labelKey: "nav.verificationRequests", icon: FileCheck2 },
  { to: "/admin/null-requests", labelKey: "nav.unmatchedOrgs", icon: AlertTriangle },
  { to: "/admin/unresponsive", labelKey: "nav.unresponsive", icon: Hourglass },
  { to: "/admin/payments", labelKey: "nav.payments", icon: Wallet },
  { to: "/admin/leads", labelKey: "nav.leads", icon: MessageSquare },
  { to: "/admin/login-history", labelKey: "nav.loginHistory", icon: History },
  { to: "/admin/activity-logs", labelKey: "nav.activityLogs", icon: ScrollText },
  { to: "/admin/support", labelKey: "nav.supportTickets", icon: Headset },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

/**
 * Account, billing and support — the sidebar's second collapsible group.
 *
 * NOT MODULE LINKS. Nothing in here is a place a person does their job: Settings is
 * their own configuration, Payments is the org's subscription (org_admin only, and
 * only they can act on it), and Support is where a request gets raised. Employees
 * and sub-admins send tier-1 tickets to their Organization Admin; an org_admin
 * sends tier-2 tickets to the platform team and works the organization's inbound
 * queue from the same page. It belongs here because every role reaches it the same
 * way, as a customer of the product.
 *
 * Split out for the same reason Personal ESS was: a menu that carries the job and the
 * account settings at the same weight makes both harder to find. And it pairs with
 * Personal ESS on purpose — two small, role-aware groups at the foot of the sidebar,
 * separated from the modules in the middle.
 *
 * `audience: "account"` rather than "management" or "self-service", so neither of the
 * two existing filters claims these. `primaryNavItemsFor` drops them from the middle
 * (see ACCOUNT_GROUP_PATHS), and `accountItemsFor` re-admits them here.
 */
export const accountNavItems: NavItem[] = [
  { to: "/settings", labelKey: "nav.settings", icon: Settings, audience: "account" },
  { to: "/payments", labelKey: "nav.payments", icon: CreditCard, audience: "account" },
  { to: "/org/support", labelKey: "nav.support", icon: Headset, audience: "account" },
];

/**
 * The account group's links, filtered to what this caller can actually open.
 *
 * Same contract as `personalEssItemsFor`, and for the same reason: a link in the
 * sidebar that leads to a page the guard refuses is worse than no link, because the
 * failure reads as a broken product rather than as a role boundary. An employee gets
 * Settings and Support — /payments is org_admin-only — and an empty result means NO
 * group is rendered at all.
 *
 * Every path here is already permitted by ROUTE_ACCESS for the roles listed; this
 * grants nothing. It only makes an already-granted page findable.
 */
export function accountItemsFor(user: AuthUser | null | undefined): NavItem[] {
  if (!user) return [];
  // Platform admins get the platform area's own Settings copy from adminNav, and the
  // payments page is not part of that area.
  if (user.role === "admin") return [];
  return accountNavItems.filter((it) => canAccessRoute(user, it.to));
}

/** Every path the sidebar can render, for the route-table coverage test. */
export const allNavPaths: string[] = [
  ...new Set(
    [...userNavItems, ...memberNavItems, ...orgAdminNavItems, ...accountNavItems, ...adminNav].map(
      (it) => it.to,
    ),
  ),
];

/** The org roles that count as "runs the organization". Mirrors routeAccess. */
const STAFF_ORG_ROLES: readonly OrgRole[] = ["org_admin", "sub_admin"];

export function isStaffOrgRole(orgRole: OrgRole | undefined | null): boolean {
  return !!orgRole && STAFF_ORG_ROLES.includes(orgRole);
}

/**
 * Pages that belong to BOTH menus.
 *
 * A dashboard is an employee's landing page and a manager's alike, so it carries no
 * audience and is named here instead of being forced into one.
 *
 * Settings USED to be listed here too, for the same reason — but it has moved into the
 * sidebar's account group, so it is no longer part of the primary menu at all and
 * naming it would re-introduce it through the filter below.
 */
/**
 * Pages that belong in EVERY role's primary menu.
 *
 *   /dashboard  an employee's landing page and a manager's alike.
 *   /requests   the person's OWN verification request. Not the queue — /inbox and
 *               /admin/requests are the queue, and an org_admin who manages the queue
 *               still has a request of their own to raise. It was "self-service" and so
 *               invisible to staff, which is how the manager with the most paperwork to
 *               raise could not find the page for it.
 *
 * Settings is NOT here. It is an account link, rendered in the account group, and
 * naming it here would put the same page in the middle of the menu and at the foot.
 */
const CROSS_CUTTING_PATHS = new Set(["/dashboard", "/requests"]);

/**
 * The PRIMARY sidebar menu for an org user, before access filtering.
 *
 * Staff get management modules only; an employee gets self-service plus the
 * cross-cutting items. This is only the raw list -- AppShell still ANDs it with
 * canAccessRoute() per item, which is what removes anything the user's plan or
 * permissions do not cover.
 *
 * Returned as a function rather than a constant because the previous design merged
 * the four exported arrays inside AppShell, which put the role decision in the
 * component where it could not be tested without rendering the whole shell.
 */
export function primaryNavItemsFor(orgRole: OrgRole | undefined | null): NavItem[] {
  const staff = isStaffOrgRole(orgRole);
  // accountNavItems is deliberately NOT spread here. Its three paths are reachable
  // through `accountItemsFor` and render in the sidebar's account group; listing them
  // again would put the same page in the middle of the menu and at the foot.
  const all = [...userNavItems, ...memberNavItems, ...orgAdminNavItems];

  return all.filter((it) => {
    if (CROSS_CUTTING_PATHS.has(it.to)) return true;
    const audience = it.audience ?? "management";
    return staff ? audience === "management" : audience === "self-service";
  });
}
