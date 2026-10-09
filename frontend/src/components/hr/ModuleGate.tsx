import { type ReactNode } from "react";
import type { ModuleFlags } from "@/services";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { ModuleFeatureLockedCard } from "@/components/common/SubscriptionLocked";

/**
 * Plan-level module gate.
 *
 * DISTINCT FROM `RequireOrgFeature`, and the two must not be confused:
 *
 *   - `RequireOrgFeature` answers "may this USER act?" — it reads
 *     `user.feature_access` and org_role. That is the SUB-ADMIN delegation axis.
 *   - `ModuleGate` answers "does this PLAN include the feature?" — it reads the
 *     org's `module_flags`, which every org on the same plan shares.
 *
 * An org admin passes RequireOrgFeature but can still be blocked here: org_admin
 * means full access to the modules their plan includes, not to modules it does
 * not. Conflating the two produces the classic bug where an org admin lands on a
 * blank page with no explanation.
 *
 * This is a UX affordance only, never a security control. The API independently
 * enforces the same rule via requireModuleFeature and answers with a 403 carrying
 * code=UPGRADE_REQUIRED plus module and module_label.
 *
 * The lock UI is ModuleFeatureLockedCard, which already carries the plan-picker
 * call to action, so this stays a thin decision wrapper.
 */
export function ModuleGate({
  module,
  children,
  /**
   * Show the lock card while the subscription query is still in flight.
   * Off by default: rendering nothing during loading avoids flashing a locked
   * card at every legitimate user on every page load, at the cost of a blank
   * frame. Turn it on for pages that are cheap to render after the gate.
   */
  showWhileLoading = false,
}: {
  module: keyof ModuleFlags;
  children: ReactNode;
  showWhileLoading?: boolean;
}) {
  const { isModuleFlagOff, isActive, orgSub, isLoading } = useOrgSubscription();

  // `module_flags == null` is a LEGACY plan, which the backend deliberately
  // treats as unrestricted (see utils/moduleFlags.js isModuleIncluded). Mirroring
  // that here is what keeps legacy orgs from being locked out of everything.
  const hasFlags = orgSub?.module_flags != null;
  const isLocked = isActive && hasFlags && isModuleFlagOff(module);

  if (isLoading && !showWhileLoading) return null;
  if (isLocked) return <ModuleFeatureLockedCard feature={module} />;
  return <>{children}</>;
}
