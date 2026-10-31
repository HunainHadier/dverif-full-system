import { ShieldX } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/permissions";
import type { FeatureKey } from "@/lib/routeAccess";

/**
 * The delegated org-feature keys this component can gate on.
 *
 * A THIRD copy of the permission list, alongside the backend's PERMISSION_KEYS and
 * routeAccess.ts's FeatureKey — which is itself the problem this audit was about, so
 * it is worth saying plainly rather than adding a fourth silently. It cannot be
 * removed outright: this is a component prop type, so it cannot import routeAccess's
 * without creating a components -> lib coupling that the rest of the file avoids.
 *
 * What holds the three in step is hrModulePermissions.test.ts, which asserts this
 * list is a SUBSET of the backend's keys AND that every key with a ROUTE_ACCESS
 * `feature` appears here. A key added to the backend and not to this file fails that
 * test rather than being quietly unavailable at runtime.
 *
 * The four HR-module keys were missing here, which meant a sub-admin could not be
 * granted them through the UI at all — the permission existed on the server and was
 * simply unreachable from the screen an org admin uses to grant it.
 */
export type OrgFeatureKey = FeatureKey;

const FEATURE_LABEL: Record<OrgFeatureKey, string> = {
  manage_employees: "Manage Employees",
  generate_request: "Generate Request",
  approve_request: "Approve Request",
  attendance: "Attendance",
  leave: "Leave",
  payroll: "Payroll",
  hr_letters: "HR Letters",
  manage_assets: "Assets",
  manage_separation: "Offboarding",
  approve_expenses: "Expense Approvals",
  manage_recruitment: "Recruitment",
};

/** Renders children only when the current user may access the requested org feature. */
export function RequireOrgFeature({
  feature,
  children,
}: {
  feature: OrgFeatureKey;
  children: React.ReactNode;
}) {
  const perms = usePermissions();
  if (perms.isOrgAdmin || perms[feature]) return <>{children}</>;
  return <AccessDenied feature={feature} />;
}

/** Standalone "no access" fallback for early-return guards inside page components. */
export function AccessDenied({ feature }: { feature: OrgFeatureKey }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldX className="h-6 w-6" />
      </div>
      <div>
        <p className="text-base font-semibold text-foreground">Access restricted</p>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          You don't have permission to view this section
          {` (${FEATURE_LABEL[feature]})`}. Contact your organization administrator if you believe
          this is a mistake.
        </p>
      </div>
      <Button variant="outline" asChild>
        <Link to="/dashboard">Back to Dashboard</Link>
      </Button>
    </div>
  );
}
