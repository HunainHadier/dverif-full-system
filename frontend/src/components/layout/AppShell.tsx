import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import notificationSound from "@/assets/NotificationSound/universfield-new-notification-040-493469.mp3";
import {
  Bell,
  CheckCheck,
  ChevronDown,
  Inbox,
  Languages,
  Lock,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authStore, useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import {
  authService,
  adminService,
  requestsService,
  notificationService,
  MODULE_FEATURES,
  type ModuleFlags,
} from "@/services";
import type { FileRouteTypes } from "@/routeTree.gen";
import { cn, resolveAssetUrl, formatDateTime } from "@/lib/utils";
import { setLanguage, getLanguage, type Language } from "@/i18n";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { SubscriptionBanner } from "@/components/common/SubscriptionLocked";
import { PlanPickerProvider, usePlanPicker } from "@/components/common/PlanPickerProvider";
import { canAccessRoute } from "@/lib/routeAccess";
import { adminNav, accountItemsFor, primaryNavItemsFor, type NavItem } from "@/lib/navItems";

export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { t } = useTranslation();
  const { openPicker } = usePlanPicker();
  const { isLocked, isModuleFlagOff } = useOrgSubscription();
  const pathModule: Record<string, keyof ModuleFlags> = {
    "/org/team": "employee_management",
    "/org/admins": "user_management",
    "/org/leaves": "leave_management",
    "/org/attendance": "attendance_management",
    "/org/salary-components": "payroll_management",
    "/org/payroll": "payroll_management",
    "/leaves": "leave_management",
    "/attendance": "attendance_management",
    "/payroll": "payroll_management",
  };
  const modulePaths = Object.keys(pathModule);
  // Two different reasons a nav item can be locked, and they need different
  // affordances:
  //   - blanket isLocked  -> the subscription itself is broken; nothing to do
  //     here beyond pointing at billing
  //   - isModuleFlagOff   -> the org IS subscribed, this plan just does not
  //     include the module, so the item offers "upgrade to unlock" and opens
  //     the plan chooser. This is the common case on the Free plan.
  const moduleOffPaths = new Set(
    !isAdmin ? modulePaths.filter((path) => isModuleFlagOff(pathModule[path])) : [],
  );
  const blanketLockedPaths = new Set(!isAdmin && isLocked ? modulePaths : []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => setMounted(true), []);

  const onLogout = async () => {
    try {
      if (user?.role === "admin") await authService.adminLogout();
      else await authService.userLogout();
    } catch {
      // ignore network error
    }
    authStore.clear();
    toast.success("Signed out");
    router.navigate({ to: user?.role === "admin" ? "/system-admin/login" : "/login" });
  };

  // Whether the inbox is reachable, from the same table the sidebar and the
  // route guard use. Drives the unread badge poll; it must not 403.
  const canApprove = canAccessRoute(user, "/inbox");

  const inboxCount = useQuery({
    queryKey: ["inbox-count"],
    queryFn: () => requestsService.myInboxCount(),
    enabled: mounted && !!user && !isAdmin && canApprove,
    refetchInterval: 30_000,
    retry: false,
  });

  const adminSidebarCounts = useQuery({
    queryKey: ["admin-sidebar-counts"],
    queryFn: () => adminService.sidebarCounts(),
    enabled: mounted && !!user && isAdmin,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const meSync = useQuery({
    queryKey: ["me-sync"],
    queryFn: () => authService.me(),
    enabled: mounted && !!user && !isAdmin,
    retry: false,
  });

  useEffect(() => {
    if (!user || isAdmin || !meSync.data) return;
    const synced = meSync.data as {
      org_role?: "employee" | "org_admin" | "sub_admin";
      feature_access?: Record<string, boolean> | null;
    };
    const updates: Record<string, unknown> = {};
    if (synced.org_role !== user.org_role) updates.org_role = synced.org_role ?? "employee";
    if (synced.feature_access !== undefined) updates.feature_access = synced.feature_access;
    if (Object.keys(updates).length) authStore.updateUser({ ...user, ...updates });
  }, [meSync.data, user, isAdmin]);

  // The sidebar asks the SAME question the route guards ask, via the same
  // table. Previously each group below re-derived visibility by hand from
  // role checks and feature flags, which is how an employee ended up with a
  // Support link that the guards bounced straight back to the dashboard.
  //
  // TWO FILTERS, IN THIS ORDER, AND THEY DO DIFFERENT JOBS:
  //
  //   1. primaryNavItemsFor / accountItemsFor decide which MENU a link belongs
  //      in -- management work for staff, self-service for an employee. This is
  //      presentation: an org_admin running payroll saw their own laptop and their
  //      own taxi claim filed at the same weight as the org's expense queue.
  //   2. canAccessRoute decides whether THIS user may open it, and additionally
  //      whether their plan includes the module.
  //
  // The order matters only in that both are ANDed -- nothing in group 1 grants
  // access, and nothing in group 2 changes prominence. Marking an item
  // self-service never locks a page: the server is the only thing that does that,
  // and for /my-assets, /my-expenses and /my-resignation it opens them to every
  // org user. That is precisely why the Personal ESS group exists -- to keep those
  // pages one click away for staff without putting them in the middle of a
  // manager's menu.
  const items: NavItem[] = isAdmin
    ? adminNav
        .filter((it) => canAccessRoute(user, it.to))
        .map((it) => {
          const counts = adminSidebarCounts.data;
          const badge =
            it.to === "/admin/leads"
              ? counts?.leads
              : it.to === "/admin/support"
                ? counts?.support_tickets
                : it.to === "/admin/payments"
                  ? counts?.custom_plan_requests
                  : it.to === "/admin/null-requests"
                    ? counts?.unmatched_requests
                    : undefined;
          return { ...it, badge };
        })
    : primaryNavItemsFor(user?.org_role)
        // No role special-casing: canAccessRoute already answers false for
        // staff on the self-service pages and for employees on the org pages.
        .filter((it) => canAccessRoute(user, it.to))
        .map((it) => (it.to === "/inbox" ? { ...it, badge: inboxCount.data ?? 0 } : it));

  /**
   * Rendered as its OWN group in the sidebar footer, NOT appended to `items`.
   *
   * Appending them to the same array was the first attempt and it defeats the
   * whole change: the links come back, just lower down, still sitting in the
   * manager's menu between Offboarding and Payments. The complaint was about a
   * management menu carrying six personal links, not about their vertical
   * position.
   */
  const accountItems = isAdmin ? [] : accountItemsFor(user);

  return (
    <PlanPickerProvider>
      <div className="min-h-screen bg-background">
        {/* Sidebar (desktop) */}
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
          <SidebarInner
            items={items}
            accountItems={accountItems}
            pathname={pathname}
            onNavigate={() => {}}
            onLogout={onLogout}
            locked={!isAdmin && isLocked}
            moduleOffPaths={moduleOffPaths}
            blanketLockedPaths={blanketLockedPaths}
            pathModule={pathModule}
          />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div
              className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar">
              <SidebarInner
                items={items}
                accountItems={accountItems}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
                onLogout={onLogout}
                locked={!isAdmin && isLocked}
                moduleOffPaths={moduleOffPaths}
                blanketLockedPaths={blanketLockedPaths}
                pathModule={pathModule}
              />
            </aside>
          </div>
        ) : null}

        <div className="lg:pl-64">
          <TopBar onMenuClick={() => setMobileOpen(true)} />
          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            {isAdmin && <div className="sr-only">admin</div>}
            {/*
            Blanket banner: reserved for a genuinely broken/absent subscription.
            A Free-plan org is active, so this must never appear for one -- the
            per-module "upgrade to unlock" affordances in the sidebar and on the
            locked feature cards cover the normal upgrade case instead.
          */}
            {!isAdmin && isLocked && <SubscriptionBanner />}
            {children}
          </main>
        </div>
      </div>
    </PlanPickerProvider>
  );
}

/**
 * Exported for the sidebar render test, which is the only way to verify what an
 * org_admin actually SEES rather than what the composition functions return.
 *
 * The composition tests in lib/sidebarRoles.test.ts pin the item lists; this one
 * renders the menu and asserts on the DOM, so a regression that puts a personal
 * link back into the primary nav -- by editing this component rather than
 * navItems -- still fails here.
 */
export function SidebarInner({
  items,
  accountItems,
  pathname,
  onNavigate,
  onLogout,
  locked,
  moduleOffPaths,
  blanketLockedPaths,
  pathModule,
}: {
  items: NavItem[];
  /**
   * The caller's own employee pages, shown as a collapsible group ABOVE sign out.
   *
   * Empty for an employee (they have these in their primary menu) and for a
   * platform admin (no employee record exists for them). Non-empty for a staff
   * member who is also on the roster.
   */
  /**
   * Settings / Payments / Support, already filtered by `accountItemsFor`.
   *
   * Passed in rather than recomputed from the auth store here, for the same reason
   * `primaryNavItemsFor` is: the sidebar should render what it is given, so the decision
   * about which links a role gets stays in one testable function instead of drifting
   * into the component.
   */
  accountItems: NavItem[];
  pathname: string;
  onNavigate: () => void;
  onLogout: () => void;
  locked: boolean;
  /** Paths whose module is excluded by the current plan -> "upgrade to unlock". */
  moduleOffPaths: Set<string>;
  /** Paths locked because the subscription itself is inactive. */
  blanketLockedPaths: Set<string>;
  pathModule: Record<string, keyof ModuleFlags>;
}) {
  const { t } = useTranslation();
  const { openPicker } = usePlanPicker();
  /**
   * Collapsed by default, and STAYS collapsed once the user has been here.
   *
   * The complaint was that personal links crowded the management menu, so opening
   * this group must cost the same one click as any other link and must not persist
   * across renders -- otherwise an org_admin who once opened it comes back to a
   * sidebar with their expenses showing again, and the change has quietly undone
   * itself.
   */
  const [accountOpen, setAccountOpen] = useState(false);
  return (
    <>
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
        <Logo />
        <button
          className="rounded-md p-1.5 text-sidebar-foreground hover:bg-sidebar-accent lg:hidden"
          onClick={onNavigate}
          aria-label={t("nav.closeMenu")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => {
          const active =
            pathname === it.to || (it.to !== "/dashboard" && pathname.startsWith(it.to));
          const moduleKey = pathModule[it.to];
          const moduleLabel = moduleKey
            ? (MODULE_FEATURES.find((m) => m.key === moduleKey)?.label ?? moduleKey)
            : null;
          // The org is subscribed but this plan does not include the module:
          // offer the upgrade inline instead of a dead-end page.
          const needsUpgrade = !!moduleKey && moduleOffPaths.has(it.to);
          // The subscription itself is broken: point at billing, not upgrades.
          const needsRenewal = blanketLockedPaths.has(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              onClick={(e) => {
                if (needsUpgrade) {
                  // Open the plan chooser for this specific module instead of
                  // navigating to a page that can only show an error.
                  e.preventDefault();
                  openPicker(moduleKey);
                  onNavigate();
                  return;
                }
                onNavigate();
              }}
              title={
                needsUpgrade
                  ? `${moduleLabel} —” ${t("moduleLocked.navLockedTitle", { module: moduleLabel ?? "" })}`
                  : needsRenewal
                    ? t("subscriptionLocked.notActive")
                    : undefined
              }
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <it.icon
                className={cn("h-4 w-4", active ? "text-sidebar-primary" : "text-muted-foreground")}
              />
              <span className="min-w-0 flex-1">{t(it.labelKey)}</span>
              {needsUpgrade ? (
                <span
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground"
                  title={t("moduleLocked.navLockedCta")}
                >
                  <Lock className="h-3 w-3" />
                  {t("common.upgrade")}
                </span>
              ) : needsRenewal ? (
                <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground/60" />
              ) : null}
              {it.badge !== undefined && it.badge > 0 ? (
                <span
                  className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
                  aria-label={`${it.badge} new`}
                  role="status"
                >
                  {it.badge > 99 ? "99+" : it.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        {/*
          ACCOUNT, BILLING AND SUPPORT — the second collapsible group, and the one
          that is not about a person's job.

          Same "only when there is something behind it" rule as Personal ESS, for the
          same reason: an employee gets Settings alone, because /payments is
          org_admin-only and /org/support is staff-only, so the group would otherwise
          advertise two pages that bounce. An org_admin gets all three.

          SEPARATE FROM Personal ESS rather than merged into it. They answer different
          questions — "what is mine" versus "about me and my company" — and folding
          six links into one group would put the job-and-payslips links next to the
          subscription one, which is how a person ends up looking for their payslip
          under "Payments".

          The two toggles are independent: expanding one does not expand the other.
        */}
        {accountItems.length ? (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setAccountOpen((v) => !v)}
              aria-expanded={accountOpen}
              aria-controls="sidebar-account"
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
              {t("nav.account")}
              <ChevronDown
                className={cn(
                  "ml-auto h-3.5 w-3.5 transition-transform",
                  accountOpen && "rotate-180",
                )}
              />
            </button>

            {accountOpen ? (
              <ul id="sidebar-account" className="mt-0.5 space-y-0.5">
                {accountItems.map((it) => (
                  <li key={it.to}>
                    <Link
                      to={it.to}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                        pathname === it.to || pathname.startsWith(`${it.to}/`)
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      )}
                    >
                      <it.icon className="h-3.5 w-3.5 shrink-0" />
                      {t(it.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}



          </div>
        ) : null}

        <button
          onClick={onLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" />
          {t("nav.signOut")}
        </button>
      </div>
    </>
  );
}

function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isAdmin = user?.role === "admin";

  const unreadCount = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: () => notificationService.unreadCount(),
    enabled: mounted && !!user && !isAdmin,
    refetchInterval: 15_000,
    retry: false,
  });

  const prevUnread = useRef<number | null>(null);

  // Play a sound when a new notification arrives (unread count increases).
  useEffect(() => {
    const current = unreadCount.data ?? 0;
    if (prevUnread.current === null) {
      prevUnread.current = current;
      return;
    }
    if (current > prevUnread.current) {
      const audio = new Audio(notificationSound);
      audio.volume = 0.6;
      audio.play().catch(() => {});
    }
    prevUnread.current = current;
  }, [unreadCount.data]);

  const [notifOpen, setNotifOpen] = useState(false);

  const notifs = useQuery({
    queryKey: ["notifications", 1],
    queryFn: () => notificationService.list({ page: 1, limit: 10 }),
    enabled: mounted && !!user && !isAdmin && notifOpen,
    retry: false,
  });

  const markRead = async (id: number) => {
    await notificationService.markRead(id);
    qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markAllRead = async () => {
    await notificationService.markAllRead();
    qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const notifItems = notifs.data?.items ?? [];
  const unread = unreadCount.data ?? 0;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        className="rounded-md p-2 text-muted-foreground hover:bg-accent lg:hidden"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />

      {!isAdmin && <LanguageToggle />}

      <Button
        variant="ghost"
        size="icon"
        onClick={toggle}
        aria-label="Toggle theme"
        className="text-muted-foreground"
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      {!isAdmin ? (
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground"
            onClick={() => setNotifOpen(!notifOpen)}
          >
            <Bell className="h-4 w-4" />
            {unread > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destruct-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Button>

          {notifOpen ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-border bg-card shadow-lg">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="text-sm font-semibold text-foreground">
                    {t("notifications.title")}
                  </span>
                  {unread > 0 ? (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <CheckCheck className="h-3.5 w-3.5" /> {t("notifications.markAllRead")}
                    </button>
                  ) : null}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifItems.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {t("notifications.noNotifications")}
                    </div>
                  ) : (
                    notifItems.map((n) => (
                      <button
                        key={n.id}
                        className={`flex w-full flex-col gap-0.5 border-b border-border/50 px-4 py-3 text-left transition-colors hover:bg-accent/50 ${
                          !n.read_at ? "bg-primary/5" : ""
                        }`}
                        onClick={() => {
                          markRead(n.id);
                          if (n.link) {
                            router.navigate({ to: n.link as FileRouteTypes["to"] });
                            setNotifOpen(false);
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          {!n.read_at ? (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                          ) : (
                            <span className="mt-1.5 h-2 w-2 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground">{n.title}</div>
                            {n.message ? (
                              <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                {n.message}
                              </div>
                            ) : null}
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              {formatDateTime(n.created_at)}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Avatar className="h-7 w-7">
          <AvatarImage
            src={resolveAssetUrl(user?.profile_image) ?? undefined}
            alt={user?.full_name}
          />
          <AvatarFallback className="bg-primary/10 text-[10px] font-medium text-primary">
            {(user?.full_name ?? "U")
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-[180px] truncate text-xs text-muted-foreground sm:inline">
          {user?.email}
        </span>
      </div>
    </header>
  );
}

function LanguageToggle() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const lang = getLanguage();

  const onChange = (next: string) => {
    const value = next as Language;
    if (value === lang) return;
    setLanguage(value);
    if (!user) return;
    const persist =
      user.role === "admin"
        ? authService.setAdminPreferredLanguage(value)
        : authService.setPreferredLanguage(value);
    persist
      .then(() => {
        authStore.updateUser({ ...user, preferred_language: value });
      })
      .catch(() => {
        // preference still applies locally for this session
      });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("lang.language")}
          className="text-muted-foreground"
        >
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("lang.language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={lang} onValueChange={onChange}>
          <DropdownMenuRadioItem value="en">{t("lang.english")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="ur">{t("lang.urdu")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
