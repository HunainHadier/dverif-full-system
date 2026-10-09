import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  paymentService,
  MODULE_FEATURES,
  type OrgSubscription,
  type ModuleFlags,
} from "@/services";
import { useAuth } from "@/lib/auth";

export function useOrgSubscription() {
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const q = useQuery({
    queryKey: ["org-subscription"],
    queryFn: () => paymentService.plan(),
    enabled: mounted && !!user && user.role !== "admin",
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const orgSub = (q.data?.org_subscription as OrgSubscription) ?? null;
  const isActive = orgSub?.status === "active";
  const isExpired = orgSub?.status === "expired";
  const isNone = orgSub?.status === "none" || orgSub === null;
  // Blanket lock. This is now a safety net for a corrupted or genuinely lapsed
  // subscription, not a normal-path state: every organization is always on a
  // real plan, and the Free plan counts as active.
  const isLocked = q.isFetched && !isActive;
  const moduleFlags: ModuleFlags | null = orgSub?.module_flags ?? null;

  // Per-module lock: the org IS subscribed, but this plan does not include the
  // module. This is what makes a Free-plan organization see Employee Management
  // while Payroll stays locked, instead of everything being locked together.
  //
  // `null` module_flags means a legacy plan, which the backend treats as
  // unrestricted, so nothing is locked.
  const isModuleFlagOff = (key: keyof ModuleFlags) =>
    isActive && moduleFlags != null && moduleFlags[key] !== true;

  const isModuleLocked = (key: keyof ModuleFlags) => isModuleFlagOff(key);

  /**
   * Which module a nav item belongs to, so the sidebar can badge the exact
   * entries the current plan excludes. Kept here (rather than in the sidebar)
   * so the sidebar, the page guards and the pricing cards all read the same
   * `org_subscription.module_flags` that the backend enforces.
   */
  const lockedModules = (keys: (keyof ModuleFlags)[]) => keys.filter((k) => isModuleFlagOff(k));

  return {
    orgSub,
    isActive,
    isExpired,
    isNone,
    isLocked,
    isModuleFlagOff,
    isModuleLocked,
    lockedModules,
    moduleFlags,
    /** True when the org has a live plan but it excludes at least one module. */
    hasModuleLocks: isActive && MODULE_FEATURES.some((m) => isModuleFlagOff(m.key)),
    isLoading: q.isLoading,
  };
}
