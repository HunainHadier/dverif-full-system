import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SubscriptionBanner } from "@/components/common/SubscriptionLocked";
import { PlanPickerProvider, usePlanPicker } from "@/components/common/PlanPickerProvider";

/**
 * The sidebar's "Upgrade" badge and the locked module card both call
 * `openPicker()`. That call only changes state: something has to be mounted to
 * render the chooser. SubscriptionBanner is that host, and for a long time the
 * app shell mounted it only when the whole subscription was inactive -- which
 * is exactly the state in which nobody needs to upgrade a single module. On a
 * normal Free plan the button therefore did nothing.
 *
 * These tests render the banner on its own: the upgrade affordance must work
 * while the subscription is ACTIVE, which is the normal case.
 */

const state = vi.hoisted(() => ({ isLocked: false }));

vi.mock("@/hooks/useOrgSubscription", () => ({
  useOrgSubscription: () => ({
    orgSub: { status: "active", plan_name: "Free", is_free: 1 },
    isActive: true,
    isExpired: false,
    isNone: false,
    isLocked: state.isLocked,
    isModuleFlagOff: () => false,
    isModuleLocked: () => false,
    lockedModules: () => [],
    moduleFlags: {},
    hasModuleLocks: true,
    isLoading: false,
  }),
}));

vi.mock("@/lib/permissions", () => ({
  useRoles: () => ({ isOrgAdmin: true, isStaff: true }),
}));

vi.mock("@/services", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services")>();
  return {
    ...actual,
    marketingService: {
      ...actual.marketingService,
      listPlans: vi.fn().mockResolvedValue([]),
    },
    orgSubscriptionService: {
      ...actual.orgSubscriptionService,
      customPlanRequests: vi.fn().mockResolvedValue([]),
    },
  };
});

function OpenPlanPicker() {
  const { openPicker } = usePlanPicker();
  return (
    <button type="button" onClick={() => openPicker("asset_management")}>
      open chooser
    </button>
  );
}

function renderWithProviders(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <PlanPickerProvider>{node}</PlanPickerProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.isLocked = false;
});

describe("SubscriptionBanner hosts the shared plan chooser", () => {
  it("opens the chooser while the subscription is active, with no banner above it", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <OpenPlanPicker />
        <SubscriptionBanner />
      </>,
    );

    // The blanket banner is for a broken subscription; an active plan must not
    // show it.
    expect(screen.queryByText("Your organization subscription is not active")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "open chooser" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("View Plan")).toBeInTheDocument();
  });

  it("still shows the banner when the subscription itself is inactive", () => {
    state.isLocked = true;
    renderWithProviders(<SubscriptionBanner />);

    expect(screen.getByText("Your organization subscription is not active")).toBeInTheDocument();
  });
});
