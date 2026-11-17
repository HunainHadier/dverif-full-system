import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { AppShell } from "@/components/layout/AppShell";
import { authStore, type AuthUser } from "@/lib/auth";
import { FEATURE_KEYS, type FeatureAccessMap } from "@/lib/featureKeys";

const h = vi.hoisted(() => ({
  navigate: vi.fn(),
  me: vi.fn(),
  serverFeatureAccess: {} as FeatureAccessMap & {
    granular_permissions: Record<string, boolean>;
  },
}));

function featureAccess(viewExpenseClaims: boolean) {
  const legacyAccess = Object.fromEntries(
    FEATURE_KEYS.map((key) => [key, true]),
  ) as FeatureAccessMap;
  return {
    ...legacyAccess,
    granular_permissions: { "expenses.view": viewExpenseClaims },
  };
}

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  useRouter: () => ({ navigate: h.navigate }),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/org/expense-claims" } }),
}));

vi.mock("@/services", () => ({
  authService: {
    me: h.me,
    adminLogout: vi.fn(),
    userLogout: vi.fn(),
  },
  adminService: { sidebarCounts: vi.fn() },
  requestsService: { myInboxCount: vi.fn() },
  notificationService: {
    unreadCount: vi.fn(async () => 0),
    list: vi.fn(async () => ({ items: [] })),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
  MODULE_FEATURES: [],
}));

vi.mock("@/hooks/useOrgSubscription", () => ({
  useOrgSubscription: () => ({
    isLocked: false,
    isModuleFlagOff: () => false,
  }),
}));

vi.mock("@/lib/theme", () => ({
  useTheme: () => ({ theme: "light", toggle: vi.fn() }),
}));

vi.mock("@/components/common/PlanPickerProvider", () => ({
  PlanPickerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePlanPicker: () => ({ openPicker: vi.fn() }),
}));

function subAdmin(featureAccess: AuthUser["feature_access"]): AuthUser {
  return {
    uuid: "aaaaaaaa-0000-4000-8000-000000000001",
    full_name: "Sub-admin",
    email: "subadmin@example.com",
    role: "user",
    org_role: "sub_admin",
    organization: 1,
    feature_access: featureAccess,
  };
}

describe("AppShell revokes an open page when permissions change", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    authStore.clear();
    h.navigate.mockClear();
    h.serverFeatureAccess = featureAccess(true);
    h.me.mockImplementation(async () => ({
      org_role: "sub_admin",
      feature_access: h.serverFeatureAccess,
    }));
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    authStore.setSession(
      "test-access-token",
      subAdmin(h.serverFeatureAccess),
    );
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    authStore.clear();
  });

  it("hides the current page and redirects after a live grant is revoked", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AppShell>
          <div data-testid="protected-expense-page">Protected expense claims</div>
        </AppShell>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("protected-expense-page")).toBeInTheDocument();

    const revokedAccess = featureAccess(false);
    h.serverFeatureAccess = revokedAccess;
    act(() => {
      authStore.updateUser(subAdmin(revokedAccess));
    });

    await waitFor(() => {
      expect(h.navigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: "/dashboard", replace: true }),
      );
    });
    expect(screen.queryByTestId("protected-expense-page")).not.toBeInTheDocument();
  });
});
