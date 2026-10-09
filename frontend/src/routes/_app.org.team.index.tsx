import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { EmployeeManager } from "@/components/employees/EmployeeManager";
import { AccessDenied } from "@/components/common/RequireOrgFeature";
import { ModuleFeatureLockedCard } from "@/components/common/SubscriptionLocked";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { usePermissions } from "@/lib/permissions";
import { orgService } from "@/services";

export const Route = createFileRoute("/_app/org/team/")({
  component: OrgTeamPage,
});

function OrgTeamPage() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const { isLocked, isModuleFlagOff } = useOrgSubscription();
  if (!perms.isOrgAdmin && !perms.manage_employees) return <AccessDenied feature="manage_employees" />;

  const moduleLocked = isModuleFlagOff("employee_management");
  if (moduleLocked) return <ModuleFeatureLockedCard feature="employee_management" />;

  return (
    <div>
      <EmployeeManager
          api={{
            list: (params) => orgService.employees(params),
            create: (data) => orgService.createEmployee(data),
            update: (uuid, data) => orgService.updateEmployee(uuid, data),
            remove: (uuid) => orgService.deleteEmployee(uuid),
            archiveReference: (uuid) => orgService.archiveReference(uuid),
          }}
          queryKey="org-employees"
          canSelectOrg={false}
          title={t("nav.myTeam")}
          description={t("team.description")}
          emptyTitle={t("team.noEmployees")}
          emptyDescription={t("team.noEmployeesDesc")}
          locked={isLocked}
          userManagementLocked={isModuleFlagOff("user_management")}
        />
      </div>
  );
}
