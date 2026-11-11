import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MoreVertical, Lock, Plus, ShieldCheck, Trash2, Pencil, Ban, Check } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "./_app.requests";
import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { ModuleFeatureLockedCard } from "@/components/common/SubscriptionLocked";
import { orgService, type OrgAdminUserRecord, type UUID } from "@/services";
import { digitsOnly, formatCNIC, parseFeatureAccess } from "@/lib/utils";
import { cnicError, normalizeCNIC } from "@/lib/contactFormat";

export const Route = createFileRoute("/_app/org/admins")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Deliberately the same call the sidebar makes when deciding whether to
    // render this page's link -- one table, so a visible link and a reachable
    // page cannot disagree. See lib/routeAccess.
    if (!canAccessRoute(authStore.get().user, "/org/admins")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: OrgAdminsPage,
});

/**
 * The permissions an org admin can delegate to a sub-admin.
 *
 * A SUBSET of FeatureKey on purpose: attendance/leave/payroll are absent because they
 * default to granted for every org user and are an employee's own self-service, so
 * there is nothing to delegate. Everything listed here defaults to DENIED, which is
 * what makes this list the whole of what a sub-admin can be given.
 *
 * The four HR-module keys were missing, which is how the modules ended up both
 * ungated on the server and ungrantable here: an org admin had no control over who
 * could issue letters, spend money on expenses, or terminate an employment, because
 * there was no dial for it.
 */
type PermissionPayload = {
  granular_permissions: Record<string, boolean>;
  data_scopes: Record<string, DataScope>;
};
type DataScope = "own_records" | "my_team" | "entire_organization";

const PERMISSION_MODULES = [
  { key: "employees", label: "Employees", actions: [["view","View"],["create","Create"],["edit","Edit"],["archive","Archive"],["export","Export"],["manage_departments","Manage Departments"],["manage_designations","Manage Designations"]] },
  { key: "document_verification", label: "Document Verification", actions: [["view_requests","View Requests"],["generate_request","Generate Request"],["edit_draft","Edit Draft"],["approve","Approve"],["reject","Reject"],["download_documents","Download Documents"]] },
  { key: "attendance", label: "Attendance", actions: [["view","View"],["manual_entry","Manual Entry"],["correct_check_in_out","Correct Check-in/out"],["manage_ips","Manage IPs"],["approve_overtime","Approve Overtime"]] },
  { key: "leave_management", label: "Leave Management", actions: [["view","View"],["submit_on_behalf","Submit on Behalf"],["approve","Approve"],["reject","Reject"],["cancel","Cancel"],["allocate_balance","Allocate Balance"],["manage_leave_types","Manage Leave Types"]] },
  { key: "payroll", label: "Payroll", actions: [["view","View"],["generate","Generate"],["manage_settings","Manage Payroll Settings"]] },
  { key: "expenses", label: "Expenses", actions: [["view","View"],["create_own","Create Own Expense"],["approve_employee","Approve Employee Expenses"],["process_payment","Process Payment"],["export","Export"]] },
  { key: "hr_letters", label: "HR Letters", actions: [["view","View"],["create_draft","Create Draft"],["edit_draft","Edit Draft"],["issue","Issue"],["revoke","Revoke"],["manage_templates","Manage Templates"]] },
  { key: "assets", label: "Assets", actions: [["view","View"],["create","Create"],["edit","Edit"],["assign","Assign"],["return","Return"],["retire","Retire"],["manage_categories","Manage Categories"]] },
  { key: "offboarding", label: "Offboarding", actions: [["view","View"],["initiate","Initiate"],["manage_checklist","Manage Checklist"],["draft_settlement","Draft Settlement"],["approve_settlement","Approve Settlement"],["complete_exit","Complete Exit"]] },
  { key: "recruitment", label: "Recruitment", actions: [["view","View"],["create_job","Create Job"],["edit_job","Edit Job"],["manage_candidates","Manage Candidates"],["schedule_interview","Schedule Interview"],["record_feedback","Record Feedback"],["manage_offers","Manage Offers"],["hire","Hire"]] },
  { key: "reports", label: "Reports", actions: [["view","View Reports"],["export","Export Reports"],["view_org_analytics","View Organization-wide Analytics"]] },
  { key: "organization_settings", label: "Organization Settings", actions: [["view","View Settings"],["edit","Edit Settings"]] },
] as const;

const ALL_GRANULAR_KEYS = PERMISSION_MODULES.flatMap((module) => module.actions.map(([action]) => `${module.key}.${action}`));
const EMPTY_PERMISSION_PAYLOAD: PermissionPayload = {
  granular_permissions: Object.fromEntries(ALL_GRANULAR_KEYS.map((key) => [key, false])),
  data_scopes: Object.fromEntries(PERMISSION_MODULES.map((module) => [module.key, "own_records" as DataScope])),
};

function permissionAccess(raw?: OrgAdminUserRecord["feature_access"]): PermissionPayload {
  let parsed: Record<string, unknown> = {};
  if (typeof raw === "string") { try { parsed = JSON.parse(raw) as Record<string, unknown>; } catch { parsed = {}; } }
  else if (raw && typeof raw === "object") parsed = raw as unknown as Record<string, unknown>;
  const grants = parsed.granular_permissions && typeof parsed.granular_permissions === "object"
    ? parsed.granular_permissions as Record<string, unknown> : {};
  const scopes = parsed.data_scopes && typeof parsed.data_scopes === "object"
    ? parsed.data_scopes as Record<string, unknown> : {};
  const legacy: Record<string, string> = {
    "employees.view":"manage_employees","employees.create":"manage_employees","employees.edit":"manage_employees","employees.archive":"manage_employees","employees.export":"manage_employees","employees.manage_departments":"manage_employees","employees.manage_designations":"manage_employees",
    "document_verification.view_requests":"approve_request","document_verification.generate_request":"generate_request","document_verification.edit_draft":"generate_request","document_verification.approve":"approve_request","document_verification.reject":"approve_request","document_verification.download_documents":"approve_request",
    "attendance.view":"attendance","attendance.manual_entry":"attendance","attendance.correct_check_in_out":"attendance","attendance.manage_ips":"attendance","attendance.approve_overtime":"attendance",
    "leave_management.view":"leave","leave_management.submit_on_behalf":"leave","leave_management.approve":"leave","leave_management.reject":"leave","leave_management.cancel":"leave","leave_management.allocate_balance":"leave","leave_management.manage_leave_types":"leave",
    "payroll.view":"payroll","payroll.generate":"payroll","payroll.manage_settings":"payroll",
    "expenses.view":"approve_expenses","expenses.create_own":"create_expenses","expenses.approve_employee":"approve_expenses","expenses.process_payment":"approve_expenses","expenses.export":"approve_expenses",
    "hr_letters.view":"hr_letters","hr_letters.create_draft":"hr_letters","hr_letters.edit_draft":"hr_letters","hr_letters.issue":"hr_letters","hr_letters.revoke":"hr_letters","hr_letters.manage_templates":"hr_letters",
    "assets.view":"manage_assets","assets.create":"manage_assets","assets.edit":"manage_assets","assets.assign":"manage_assets","assets.return":"manage_assets","assets.retire":"manage_assets","assets.manage_categories":"manage_assets",
    "offboarding.view":"manage_separation","offboarding.initiate":"manage_separation","offboarding.manage_checklist":"manage_separation","offboarding.draft_settlement":"manage_separation","offboarding.approve_settlement":"manage_separation","offboarding.complete_exit":"manage_separation",
    "recruitment.view":"manage_recruitment","recruitment.create_job":"manage_recruitment","recruitment.edit_job":"manage_recruitment","recruitment.manage_candidates":"manage_recruitment","recruitment.schedule_interview":"manage_recruitment","recruitment.record_feedback":"manage_recruitment","recruitment.manage_offers":"manage_recruitment","recruitment.hire":"manage_recruitment",
  };
  const granular_permissions = Object.fromEntries(ALL_GRANULAR_KEYS.map((key) => [
    key, parsed.granular_permissions ? grants[key] === true : Boolean(parsed[legacy[key]]),
  ]));
  const data_scopes = Object.fromEntries(PERMISSION_MODULES.map((module) => {
    const scope = scopes[module.key];
    return [module.key, scope === "my_team" || scope === "entire_organization" ? scope : "own_records"];
  })) as Record<string, DataScope>;
  return { granular_permissions, data_scopes };
}

function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { message?: string } } };
  return err?.response?.data?.message ?? fallback;
}

function OrgAdminsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { isLocked, isModuleFlagOff } = useOrgSubscription();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<OrgAdminUserRecord | null>(null);
  const [revoking, setRevoking] = useState<{ uuid: UUID; name: string } | null>(null);
  const [cancelling, setCancelling] = useState<{ uuid: UUID; name: string } | null>(null);
  const [removing, setRemoving] = useState<{ uuid: UUID; name: string } | null>(null);

  const list = useQuery({
    queryKey: ["org-admin-users", page, search],
    queryFn: () => orgService.adminUsers.list({ page, limit: 10, search }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["org-admin-users"] });

  const revokeMut = useMutation({
    mutationFn: (uuid: UUID) => orgService.adminUsers.deactivate(uuid),
    onSuccess: () => {
      toast.success("Sub-admin deactivated");
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Deactivate failed")),
  });

  const updatePerfMut = useMutation({
    mutationFn: ({ uuid, permissions }: { uuid: UUID; permissions: PermissionPayload }) =>
      orgService.adminUsers.update(uuid, permissions),
    onSuccess: () => {
      toast.success("Sub-admin permissions updated");
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Update failed")),
  });

  // Pending-invite lifecycle, mirroring the platform /admin/users page. Both are
  // only reachable from the UI while is_verified === 'no', and both are refused
  // by the backend once the invite has been accepted.
  const cancelInviteMut = useMutation({
    mutationFn: (uuid: UUID) => orgService.adminUsers.cancelInvite(uuid),
    onSuccess: () => {
      toast.success("Invitation cancelled. Sub-admin marked inactive.");
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Failed to cancel invitation")),
  });

  const removeMut = useMutation({
    mutationFn: (uuid: UUID) => orgService.adminUsers.remove(uuid),
    onSuccess: () => {
      toast.success("Sub-admin permanently removed");
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Failed to remove sub-admin")),
  });

  const items = list.data?.items ?? [];

  const moduleLocked = isModuleFlagOff("user_management");
  if (moduleLocked) return <ModuleFeatureLockedCard feature="user_management" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.orgAdmins")}
        description="Manage sub-admin accounts for your organization. Sub-admins are members with admin-configurable permissions — they never get full Org Admin power."
        actions={
          <Button
            size="sm"
            disabled={isLocked}
            onClick={() => {
              setOpenForm(true);
            }}
          >
            {isLocked ? <Lock className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
            {isLocked ? "Subscription Required" : "Add Sub-Admin"}
          </Button>
        }
      />

      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          <div className="border-b border-border p-4">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by name, email, CNIC or phone…"
            />
          </div>

          {list.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ShieldCheck}
                title="No sub-admins"
                description="Add your first sub-admin to delegate verification and employee-management tasks safely."
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((u, i) => {
                    const perms = permissionAccess(u.feature_access);
                    const granted = PERMISSION_MODULES.flatMap((module) => module.actions
                      .filter(([action]) => perms.granular_permissions[`${module.key}.${action}`])
                      .map(([action, label]) => ({ key: `${module.key}.${action}`, label, description: module.label })));
                    return (
                      <TableRow key={u.uuid}>
                        <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                          {(page - 1) * 10 + i + 1}
                        </TableCell>
                        <TableCell data-label="Name">
                          <div className="font-medium text-foreground">{u.full_name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell data-label="Status">
                          <Badge
                            variant="outline"
                            className={
                              u.status === "inactive"
                                ? "rounded-full border-amber-500/30 bg-amber-500/10 text-amber-600"
                                : "rounded-full border-success/30 bg-success/10 text-success"
                            }
                          >
                            {u.status === "inactive" ? "Invite pending" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell data-label="Permissions">
                          {granted.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : granted.length === ALL_GRANULAR_KEYS.length ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                                >
                                  <ShieldCheck className="h-3 w-3" />
                                  All Permissions ({granted.length})
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80 p-3 text-sm shadow-xl" align="start">
                                <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">
                                  All Permissions Granted ({granted.length})
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                  {granted.map((p) => (
                                    <div key={p.key} className="flex items-start gap-2 text-xs">
                                      <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                      <div>
                                        <span className="font-medium text-foreground">{p.label}</span>
                                        <p className="text-[11px] text-muted-foreground leading-tight">
                                          {p.description}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : granted.length <= 2 ? (
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {granted.map((p) => (
                                <Badge
                                  key={p.key}
                                  variant="outline"
                                  className="rounded-full border-primary/30 bg-primary/10 text-primary font-normal text-xs py-0.5"
                                >
                                  {p.label}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 flex-nowrap">
                              {granted.slice(0, 2).map((p) => (
                                <Badge
                                  key={p.key}
                                  variant="outline"
                                  className="rounded-full border-primary/30 bg-primary/10 text-primary font-normal text-xs py-0.5 whitespace-nowrap"
                                >
                                  {p.label}
                                </Badge>
                              ))}
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    +{granted.length - 2} more
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 p-3 text-sm shadow-xl" align="start">
                                  <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-2">
                                    Granted Permissions ({granted.length})
                                  </div>
                                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {granted.map((p) => (
                                      <div key={p.key} className="flex items-start gap-2 text-xs">
                                        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                        <div>
                                          <span className="font-medium text-foreground">{p.label}</span>
                                          <p className="text-[11px] text-muted-foreground leading-tight">
                                            {p.description}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                          )}
                        </TableCell>
                        <TableCell data-label="Created" className="text-muted-foreground">
                          {u.created_at ? new Date(String(u.created_at).replace(" ", "T")).toLocaleDateString() : "—"}
                        </TableCell>
                        <TableCell data-label="Actions" className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Sub-admin actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={isLocked}
                              onClick={() => setEditing(u)}
                            >
                              {isLocked ? <Lock className="mr-2 h-4 w-4" /> : <Pencil className="mr-2 h-4 w-4" />}
                              Edit Permissions
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {/* A sub-admin who has not accepted yet is not an
                                account to deactivate - it is an invitation, and
                                the two things you can actually do with an
                                invitation are call it off or delete it. Once
                                accepted these disappear and deactivation takes
                                over. */}
                            {u.is_verified === "no" ? (
                              <>
                                <DropdownMenuItem
                                  disabled={isLocked || !u.invitation_pending}
                                  onClick={() =>
                                    setCancelling({ uuid: u.uuid, name: u.full_name })
                                  }
                                >
                                  <Ban className="mr-2 h-4 w-4" />
                                  {u.invitation_pending
                                    ? "Cancel Invitation"
                                    : "No pending invitation"}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={isLocked}
                                  className="text-destructive focus:text-destructive"
                                  onClick={() =>
                                    setRemoving({ uuid: u.uuid, name: u.full_name })
                                  }
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Remove Permanently
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <DropdownMenuItem
                                disabled={isLocked}
                                className="text-destructive focus:text-destructive"
                                onClick={() => setRevoking({ uuid: u.uuid, name: u.full_name })}
                              >
                                {isLocked ? <Lock className="mr-2 h-4 w-4" /> : <Ban className="mr-2 h-4 w-4" />}
                                Deactivate Account
                              </DropdownMenuItem>
                            )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                total={list.data?.total ?? 0}
                totalPages={list.data?.totalPages ?? 1}
                onChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <CreateSubAdminDialog
        open={openForm}
        onOpenChange={setOpenForm}
        onDone={() => {
          setOpenForm(false);
          invalidate();
        }}
      />

      <EditSubAdminPermissionsDialog
        subAdmin={editing}
        onOpenChange={() => setEditing(null)}
        onSubmit={({ uuid, permissions }) => updatePerfMut.mutateAsync({ uuid, permissions })}
        submitting={updatePerfMut.isPending}
        onDone={() => setEditing(null)}
      />

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Deactivate this sub-admin?"
        description={`${revoking?.name} will lose the ability to log in immediately. Their sub-admin permissions remain stored but the account is disabled.`}
        confirmLabel="Deactivate"
        onConfirm={() => {
          if (revoking) revokeMut.mutate(revoking.uuid);
          setRevoking(null);
        }}
      />

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Cancel this invitation?"
        description={`The invite link for ${cancelling?.name} will stop working and the account will be marked inactive. The sub-admin record is kept, so you can send a new invite later.`}
        confirmLabel="Cancel Invitation"
        onConfirm={() => {
          if (cancelling) cancelInviteMut.mutate(cancelling.uuid);
          setCancelling(null);
        }}
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Permanently remove this sub-admin?"
        description={`This permanently deletes ${removing?.name}'s account and any pending invite. It only applies to invitations that were never accepted, and it cannot be undone.`}
        confirmLabel="Remove Permanently"
        onConfirm={() => {
          if (removing) removeMut.mutate(removing.uuid);
          setRemoving(null);
        }}
      />
      </div>
  );
}

function FeatureCheckboxes({ value, onChange }: { value: PermissionPayload; onChange: (v: PermissionPayload) => void }) {
  const toggleModule = (moduleKey: string, checked: boolean) => {
    const module = PERMISSION_MODULES.find((item) => item.key === moduleKey);
    if (!module) return;
    const next = { ...value.granular_permissions };
    module.actions.forEach(([action]) => { next[`${moduleKey}.${action}`] = checked; });
    onChange({ ...value, granular_permissions: next });
  };
  return <Accordion type="multiple" className="w-full">
    {PERMISSION_MODULES.map((module) => {
      const keys = module.actions.map(([action]) => `${module.key}.${action}`);
      const count = keys.filter((key) => value.granular_permissions[key]).length;
      return <AccordionItem key={module.key} value={module.key}>
        <div className="flex items-center gap-3 py-2">
          <Checkbox checked={count === keys.length ? true : count ? "indeterminate" : false}
            onCheckedChange={(checked) => toggleModule(module.key, checked === true)} />
          <div className="min-w-0 flex-1">
            <AccordionTrigger className="py-1 hover:no-underline">
              <span className="flex items-center gap-2"><span>{module.label}</span>
                <span className="text-xs text-muted-foreground">{count}/{keys.length}</span></span>
            </AccordionTrigger>
          </div>
        </div>
        <AccordionContent>
          <div className="grid gap-3 border-l-2 border-border pl-5 sm:grid-cols-2">
            {module.actions.map(([action,label]) => {
              const key = `${module.key}.${action}`;
              return <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={value.granular_permissions[key] === true}
                  onCheckedChange={(checked) => onChange({ ...value, granular_permissions: { ...value.granular_permissions, [key]: checked === true }})} />
                <span>{label}</span>
              </label>;
            })}
          </div>
          <div className="mt-4 flex flex-col gap-1.5 sm:max-w-xs">
            <Label className="text-xs">Data visibility scope</Label>
            <select value={value.data_scopes[module.key] ?? "own_records"}
              onChange={(event) => onChange({ ...value, data_scopes: { ...value.data_scopes, [module.key]: event.target.value as DataScope }})}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="own_records">Own Records</option><option value="my_team">My Team / Assigned Team</option>
              <option value="entire_organization">Entire Organization</option>
            </select>
          </div>
        </AccordionContent>
      </AccordionItem>;
    })}
  </Accordion>;
}

function EditSubAdminPermissionsDialog({
  subAdmin,
  onOpenChange,
  onSubmit,
  submitting,
  onDone,
}: {
  subAdmin: OrgAdminUserRecord | null;
  onOpenChange: () => void;
  onSubmit: (vars: {
    uuid: UUID;
    permissions: PermissionPayload;
  }) => Promise<unknown>;
  submitting: boolean;
  onDone: () => void;
}) {
  const [access, setAccess] = useState<PermissionPayload>(EMPTY_PERMISSION_PAYLOAD);
  const [seedKey, setSeedKey] = useState("");

  // Seed the checkboxes from the selected sub-admin whenever it changes.
  const key = subAdmin?.uuid ?? "";
  if (key !== seedKey) {
    setSeedKey(key);
    setAccess(permissionAccess(subAdmin?.feature_access));
  }

  const submit = async () => {
    if (!subAdmin) return;
    try {
      await onSubmit({ uuid: subAdmin.uuid, permissions: access });
      toast.success("Sub-admin permissions updated");
      onDone();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Update failed"));
    }
  };

  return (
    <Dialog open={!!subAdmin} onOpenChange={(v) => !v && onOpenChange()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Permissions — {subAdmin?.full_name ?? "Sub-admin"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {subAdmin && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{subAdmin.email}</span> &nbsp;·&nbsp;
              Role: Sub-admin
            </p>
          )}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label className="text-sm font-medium">Permissions</Label>
            <p className="text-xs text-muted-foreground">
              Sub-admins gain exactly the action permissions you grant here. Changes take effect immediately.
            </p>
            <p className="text-xs text-amber-600">Data-scope selections are saved separately. Server-side query filtering for these scopes is not yet complete, so do not rely on these selections as an access-control boundary yet.</p>
            <FeatureCheckboxes value={access} onChange={setAccess} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onOpenChange} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting} disabled={!subAdmin}>
            Save Permissions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateSubAdminDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [cnic, setCnic] = useState("");
  const [phone, setPhone] = useState("");
  const [access, setAccess] = useState<PermissionPayload>(EMPTY_PERMISSION_PAYLOAD);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = "Name is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "A valid email is required";
    if (!normalizeCNIC(cnic)) e.cnic = "CNIC is required";
    else if (cnicError(cnic)) e.cnic = cnicError(cnic)!;
    if (phone && !/^[0-9+\-() ]{6,30}$/.test(phone)) e.phone = "Invalid phone number";
    setErrors(e);
    if (Object.keys(e).length) return;

    setSubmitting(true);
    try {
      const res = await orgService.adminUsers.create({
        full_name: fullName.trim(),
        email: email.trim(),
        cnic: normalizeCNIC(cnic),
        phone: phone.trim() || undefined,
        granular_permissions: access.granular_permissions,
        data_scopes: access.data_scopes,
      });
      if (res._email_warning) toast.warning(res._email_warning);
      else toast.success("Sub-admin created. Set-password email sent.");
      setFullName("");
      setEmail("");
      setCnic("");
      setPhone("");
      setAccess(EMPTY_PERMISSION_PAYLOAD);
      onDone();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Create failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Sub-Admin</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Full Name *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Enter full name" />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(digitsOnly(e.target.value))} placeholder="Phone number" />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>CNIC *</Label>
            <Input
              value={cnic}
              onChange={(e) => setCnic(formatCNIC(e.target.value))}
              placeholder="XXXXX-XXXXXXX-X"
              maxLength={15}
              inputMode="numeric"
            />
            {errors.cnic && <p className="text-xs text-destructive">{errors.cnic}</p>}
          </div>

          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label className="text-sm font-medium">Permissions</Label>
            <p className="text-xs text-muted-foreground">
              Sub-admins never get full Org Admin power — they gain exactly the action permissions you grant here.
            </p>
            <p className="text-xs text-amber-600">Data-scope selections are saved separately. Server-side query filtering for these scopes is not yet complete, so do not rely on these selections as an access-control boundary yet.</p>
            <FeatureCheckboxes value={access} onChange={setAccess} />
          </div>

          <p className="text-xs text-muted-foreground">
            A “Set your password” email is sent automatically to the address above.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Create Sub-Admin
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
