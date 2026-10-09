import { createFileRoute, redirect } from "@tanstack/react-router";
import { SalaryComponentsManager } from "@/components/salary/SalaryComponentsManager";
import { AccessDenied } from "@/components/common/RequireOrgFeature";
import { usePermissions } from "@/lib/permissions";
import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { parseFeatureAccess } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/salary-components")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Deliberately the same call the sidebar makes when deciding whether to
    // render this page's link -- one table, so a visible link and a reachable
    // page cannot disagree. See lib/routeAccess.
    if (!canAccessRoute(authStore.get().user, "/org/salary-components")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: OrgSalaryComponentsPage,
});

function OrgSalaryComponentsPage() {
  const perms = usePermissions();
  if (!perms.isOrgAdmin && !perms.payroll) return <AccessDenied feature="payroll" />;
  return <SalaryComponentsManager />;
}
