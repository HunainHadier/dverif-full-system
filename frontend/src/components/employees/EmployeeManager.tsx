import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Archive, Contact, Download, Eye, FileUp, Lock, Mail, Plus, RefreshCw, Send, Trash2, Users } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ProtectedDocumentLink } from "@/components/common/ProtectedDocumentLink";
import { EmployeeDocPicker, type StagedDoc } from "@/components/employees/EmployeeDocPicker";
import { ManageOptionsDialog } from "@/components/employees/ManageOptionsDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TableSkeleton } from "@/routes/_app.requests";
import { adminService, isCurrentEmployee, orgService, type EmployeeDocument, type EmployeeRecord, type ManagedOption, type Organization, type UUID } from "@/services";
import { CONTACT_VALIDATION_LABEL, cnicError, formatCNIC, normalizeCNIC, phoneError } from "@/lib/contactFormat";
import { formatDate, formatFileSize, normalizeDateInputValue } from "@/lib/utils";

type EmployeeApi = {
  list: (params: { page?: number; limit?: number; search?: string; reference?: boolean }) => Promise<{
    items: EmployeeRecord[];
    total: number;
    totalPages: number;
  }>;
  create: (data: Record<string, unknown>) => Promise<{ employee: EmployeeRecord; _email_warning?: string; linked_existing_account?: boolean }>;
  update: (uuid: UUID, data: Record<string, unknown>) => Promise<EmployeeRecord>;
  remove: (uuid: UUID) => Promise<unknown>;
  archiveReference?: (uuid: UUID) => Promise<EmployeeRecord>;
};

function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { message?: string } } };
  return err?.response?.data?.message ?? fallback;
}

/**
 * Status options offered when CREATING an employee.
 *
 * 'inactive' (deactivated) is deliberately absent. It is not a lifecycle stage
 * a new record can be in — it is the kill-switch the API's auth guards read to
 * refuse an account — so there is nothing to deactivate at creation time. It
 * appears only when editing, in EDIT_STATUS_OPTIONS below.
 *
 * 'active' is kept as an offered value because it is a real, distinct server
 * state (a deactivated account being carried forward); 'current_employee' is the
 * default a new record lands on.
 */
const CREATE_STATUS_OPTIONS: { value: EmployeeRecord["status"]; label: string }[] = [
  { value: "current_employee", label: "Current Employee" },
  { value: "active", label: "Active" },
  { value: "ex_employee", label: "Ex-Employee" },
];

/**
 * Status options offered when EDITING — CREATE_STATUS_OPTIONS plus 'inactive'.
 *
 * This is the only place deactivation can be set, which is the point: an admin
 * switches a colleague off from their existing record rather than at creation.
 */
const EDIT_STATUS_OPTIONS: { value: EmployeeRecord["status"]; label: string }[] = [
  ...CREATE_STATUS_OPTIONS,
  { value: "inactive", label: "Inactive (deactivated)" },
];

function statusBadgeClass(status: EmployeeRecord["status"]) {
  switch (status) {
    case "current_employee":
      return "rounded-full border-success/30 bg-success/10 text-success";
    case "active":
      return "rounded-full border-success/30 bg-success/10 text-success";
    case "inactive":
      return "rounded-full border-amber-500/30 bg-amber-500/10 text-amber-600";
    case "ex_employee":
      return "rounded-full border-blue-500/30 bg-blue-500/10 text-blue-600";
    default:
      return "rounded-full border-border text-muted-foreground";
  }
}

/** Display labels. Kept separate from the option lists because the badge must
 *  also render values the form can no longer set (an employee deactivated before
 *  this change, say) without falling back to a raw enum value. */
const STATUS_LABELS: Record<string, string> = {
  current_employee: "Current Employee",
  ex_employee: "Ex-Employee",
  active: "Active",
  inactive: "Inactive",
};

function statusLabel(status: EmployeeRecord["status"]) {
  return STATUS_LABELS[status] ?? status;
}

type InviteStatus =
  | { kind: "none" }
  | { kind: "used" }
  | { kind: "active"; daysAgo: number }
  | { kind: "expired"; daysAgo: number }
  | { kind: "failed"; daysAgo: number };

function inviteStatus(emp: EmployeeRecord): InviteStatus {
  // No linked account means roster-only; an active account is independent of its old invite token.
  if (emp.is_platform_user !== "yes") return { kind: "none" };
  if (emp.linked_user_status === "active" || emp.invite_used_at) return { kind: "used" };
  // Delivery failure or a linked but tokenless account can be retried safely.
  if (emp.invite_delivery_status === "failed" || !emp.invite_sent_at) {
    const sent = new Date(String(emp.invite_sent_at).replace(" ", "T")).getTime();
    return { kind: "failed", daysAgo: Math.max(0, Math.floor((Date.now() - sent) / 86400000)) };
  }
  const sent = new Date(String(emp.invite_sent_at).replace(" ", "T")).getTime();
  const now = Date.now();
  const daysAgo = Math.max(0, Math.floor((now - sent) / (1000 * 60 * 60 * 24)));

  // If not used and expired -> expired
  if (emp.invite_expires_at && new Date(String(emp.invite_expires_at).replace(" ", "T")).getTime() < now) {
    return { kind: "expired", daysAgo };
  }
  return { kind: "active", daysAgo };
}

export function EmployeeManager({
  api,
  queryKey,
  canSelectOrg,
  title,
  description,
  emptyTitle,
  emptyDescription,
  locked,
  userManagementLocked,
}: {
  api: EmployeeApi;
  queryKey: string;
  canSelectOrg: boolean;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  locked?: boolean;
  userManagementLocked?: boolean;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [listMode, setListMode] = useState<"roster" | "reference">("roster");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<EmployeeRecord | null>(null);
  const [toDelete, setToDelete] = useState<UUID | null>(null);

  const isReferenceMode = listMode === "reference";

  const list = useQuery({
    queryKey: [queryKey, page, search, isReferenceMode],
    queryFn: () => api.list({ page, limit: 10, search, reference: isReferenceMode || undefined }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: [queryKey] });

  const del = useMutation({
    mutationFn: (uuid: UUID) => api.remove(uuid),
    onSuccess: () => {
      toast.success("Employee deleted");
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Delete failed")),
  });

  const resendInviteMut = useMutation({
    mutationFn: (uuid: UUID) => orgService.resendInvite(uuid),
    onSuccess: (res) => {
      toast.success(
        res?.linked_existing_account
          ? "Existing platform account linked."
          : "Invite resent. Fresh set-password link sent.",
      );
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Resend failed")),
  });

  const items = list.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          !isReferenceMode ? (
            <Button
              size="sm"
              disabled={locked}
              onClick={() => {
                setEditing(null);
                setOpenForm(true);
              }}
            >
              {locked ? <Lock className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
              {locked ? "Subscription Required" : "Add Employee"}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4">
        <ToggleGroup
          type="single"
          value={listMode}
          onValueChange={(v) => {
            if (!v) return;
            setListMode(v as "roster" | "reference");
            setPage(1);
          }}
          variant="outline"
        >
          <ToggleGroupItem value="roster" className="text-sm">
            <Users className="mr-1.5 h-4 w-4" />
            {t("team.roster")}
          </ToggleGroupItem>
          <ToggleGroupItem value="reference" className="text-sm">
            <Archive className="mr-1.5 h-4 w-4" />
            {t("team.exEmployees")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>


      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          <div className="border-b border-border p-4">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder={isReferenceMode ? "Search ex-employee records..." : "Search by name, email, CNIC, designation or department..."}
            />
          </div>

          {list.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={isReferenceMode ? Archive : Contact}
                title={isReferenceMode ? "No ex-employee records" : emptyTitle}
                description={isReferenceMode ? "Archived employees will appear here, keeping their documents and history." : emptyDescription}
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead>Name</TableHead>
                    {!isReferenceMode && (
                      <>
                        <TableHead>Designation</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Added By</TableHead>
                      </>
                    )}
                    {isReferenceMode && (
                      <>
                        <TableHead>Status</TableHead>
                        <TableHead>Added By</TableHead>
                      </>
                    )}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((emp, i) => {
                    // record_type is gone; status carries roster membership now.
                    // 'inactive' (deactivated) is still a CURRENT employee — it is
                    // on the roster and cannot log in — so isCurrentEmployee, not a
                    // bare status check, is what decides membership.
                    const isRef = !isCurrentEmployee(emp.status);
                    const isCurrent = isCurrentEmployee(emp.status);
                    return (
                    <TableRow key={emp.uuid}>
                      <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                        {(page - 1) * 10 + i + 1}
                      </TableCell>
                      <TableCell data-label="Name">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{emp.full_name}</span>
                          {emp.employee_code ? <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{emp.employee_code}</span> : null}
                          {isRef && (
                            <Badge variant="outline" className="rounded-full border-blue-500/30 bg-blue-500/10 text-blue-600 text-[10px] font-medium whitespace-nowrap">
                              Ex-Employee
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{emp.email ?? "—"}</div>
                        {(() => {
                          const st = inviteStatus(emp);
                          if (st.kind === "used") return <div className="mt-0.5 text-[10px] text-emerald-700">Portal access: Active</div>;
                          if (st.kind === "none") return <div className="mt-0.5 text-[10px] text-muted-foreground">Portal access: No portal access</div>;
                          const expired = st.kind === "expired";
                          const failed = st.kind === "failed";
                          return (
                            <div
                              className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium ${
                                expired || failed
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-amber-500/10 text-amber-600"
                              }`}
                            >
                              <Mail className="h-2.5 w-2.5" />
                              {failed ? "Invite failed ? resend required" : expired
                                ? `Invite expired (sent ${st.daysAgo}d ago)`
                                : `Invite sent ${st.daysAgo}d ago`}
                            </div>
                          );
                        })()}
                      </TableCell>
                      {!isReferenceMode && (
                        <>
                          <TableCell data-label="Designation" className="text-muted-foreground">
                            {emp.designation ?? "—"}
                          </TableCell>
                          <TableCell data-label="Department" className="text-muted-foreground">
                            {emp.department ?? "—"}
                          </TableCell>
                          <TableCell data-label="Status">
                            <Badge variant="outline" className={statusBadgeClass(emp.status)}>
                              {statusLabel(emp.status)}
                            </Badge>
                          </TableCell>
                    
                       
                        </>
                      )}
                      {isReferenceMode && (
                        <TableCell data-label="Status">
                          <Badge variant="outline" className={statusBadgeClass(emp.status)}>
                            {statusLabel(emp.status)}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell data-label="Added By" className="text-muted-foreground">
                        {emp.added_by_name ?? "—"}
                      </TableCell>
                      <TableCell data-label="Actions" className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!isRef && (() => {
                            const st = inviteStatus(emp);
                            if (st.kind === "active" || st.kind === "expired" || st.kind === "failed") {
                              return (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 whitespace-nowrap px-2 text-xs"
                                  onClick={() => resendInviteMut.mutate(emp.uuid)}
                                  disabled={locked || userManagementLocked || resendInviteMut.isPending}
                                >
                                  {locked || userManagementLocked ? <Lock className="mr-1 h-3 w-3" /> : <RefreshCw className="mr-1 h-3 w-3" />}
                                  Resend
                                </Button>
                              );
                            }
                            if (st.kind === "none" && emp.email) {
                              return (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 whitespace-nowrap px-2 text-xs"
                                  onClick={() => resendInviteMut.mutate(emp.uuid)}
                                  disabled={locked || userManagementLocked || resendInviteMut.isPending}
                                >
                                  {locked || userManagementLocked ? <Lock className="mr-1 h-3 w-3" /> : <Mail className="mr-1 h-3 w-3" />}
                                  Send email
                                </Button>
                              );
                            }
                            return null;
                          })()}
                          {/* The Archive button was removed: turning someone into an
                              ex-employee is now just setting their status to
                              "Ex-Employee" in the edit form, which is where every
                              other status change happens. A second control for the
                              same field is how the two drifted apart before. */}
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() =>
                              navigate({ to: "/org/team/$uuid", params: { uuid: emp.uuid } })
                            }
                            aria-label={`View ${emp.full_name}`}
                            title="View employee"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
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

      <EmployeeFormDialog
        key={editing?.uuid ?? "new"}
        open={openForm}
        onOpenChange={setOpenForm}
        editing={editing}
        api={api}
        canSelectOrg={canSelectOrg}
        userManagementLocked={userManagementLocked}
        onDone={() => {
          setOpenForm(false);
          invalidate();
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this employee?"
        description="This will permanently remove the HR record. Employees linked to a platform user cannot be deleted."
        onConfirm={() => {
          if (toDelete) del.mutate(toDelete);
          setToDelete(null);
        }}
      />

      </div>
  );
}

function EmployeeFormDialog({
  open,
  onOpenChange,
  editing,
  api,
  canSelectOrg,
  userManagementLocked,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: EmployeeRecord | null;
  api: EmployeeApi;
  canSelectOrg: boolean;
  userManagementLocked?: boolean;
  onDone: () => void;
}) {
  const isEdit = !!editing;
  const { user } = useAuth();
  const canDelete = user?.org_role === "org_admin";

  const [form, setForm] = useState({
    full_name: editing?.full_name ?? "",
    cnic: editing?.cnic ?? "",
    email: editing?.email ?? "",
    phone: editing?.phone ?? "",
    designation: editing?.designation ?? "",
    department: editing?.department ?? "",
    employment_type: editing?.employment_type ?? "",
    work_location: editing?.work_location ?? "",
    reporting_manager_uuid: editing?.reporting_manager_uuid ?? "",
    // Defaults to 'current_employee', matching the column default and the create
    // payload's own fallback. Defaulting to 'active' would create an employee
    // that reads as deactivated.
    status: (editing?.status ?? "current_employee") as EmployeeRecord["status"],
    joining_date: normalizeDateInputValue(editing?.joining_date),
    emergency_contact: editing?.emergency_contact ?? "",
    current_salary: editing ? String(editing?.current_salary ?? "") : "",
    send_invite: false,
    organization_uuid: (editing as unknown as { organization_uuid?: string })?.organization_uuid ?? "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      full_name: editing?.full_name ?? "",
      cnic: editing?.cnic ?? "",
      email: editing?.email ?? "",
      phone: editing?.phone ?? "",
      designation: editing?.designation ?? "",
      department: editing?.department ?? "",
      employment_type: editing?.employment_type ?? "",
      work_location: editing?.work_location ?? "",
      reporting_manager_uuid: editing?.reporting_manager_uuid ?? "",
      status: (editing?.status ?? "current_employee") as EmployeeRecord["status"],
      joining_date: normalizeDateInputValue(editing?.joining_date),
      emergency_contact: editing?.emergency_contact ?? "",
      current_salary: editing ? String(editing.current_salary ?? "") : "",
      send_invite: false,
      organization_uuid: (editing as unknown as { organization_uuid?: string })?.organization_uuid ?? "",
    });
  }, [open, editing?.uuid]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const departmentsQ = useQuery({
    queryKey: ["org-departments"],
    queryFn: () => orgService.departments.list(),
    enabled: open,
  });
  const designationsQ = useQuery({
    queryKey: ["org-designations"],
    queryFn: () => orgService.designations.list(),
    enabled: open,
  });
  const managersQ = useQuery({
    queryKey: ["employee-manager-options", editing?.organization_id],
    queryFn: () => api.list({ page: 1, limit: 1000 }),
    enabled: open && isEdit,
  });

  const [manageType, setManageType] = useState<null | "department" | "designation">(null);

  const docsQ = useQuery({
    queryKey: ["emp-docs", editing?.uuid],
    queryFn: () => orgService.employeeDocuments.list(editing!.uuid),
    enabled: !!editing?.uuid && open,
  });

  const [stagedDocs, setStagedDocs] = useState<StagedDoc[]>([]);
  const uploadDocsMut = useMutation({
    mutationFn: async () => {
      for (const d of stagedDocs) {
        const fd = new FormData();
        fd.append("documents", d.file);
        if (d.name.trim()) fd.append("document_type", d.name.trim());
        await orgService.employeeDocuments.upload(editing!.uuid, fd);
      }
    },
    onSuccess: () => {
      setStagedDocs([]);
      docsQ.refetch();
      toast.success("Documents uploaded");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Upload failed")),
  });

  const uploadStagedDocs = async (employeeUuid: string) => {
    for (const d of stagedDocs) {
      const fd = new FormData();
      fd.append("documents", d.file);
      if (d.name.trim()) fd.append("document_type", d.name.trim());
      await orgService.employeeDocuments.upload(employeeUuid, fd);
    }
  };
  const deleteDocMut = useMutation({
    mutationFn: (uuid: UUID) => orgService.employeeDocuments.remove(uuid),
    onSuccess: () => {
      docsQ.refetch();
      toast.success("Document deleted");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Delete failed")),
  });

  /**
   * Identity validation, all of it now delegated to the shared contactFormat
   * module.
   *
   * The CNIC checks it replaces used to be a bare non-empty test, so a CNIC of
   * "1234" was saved and only failed later — at the uniqueness check, or not at
   * all, since the platform has several places that collect this field. The
   * phone field had no validation here at all while `org.admins` had a regex, so
   * the same number was refused in one screen and accepted in the other.
   *
   * DIGITS ARE STRIPPED ON SUBMIT, not on keystroke. The input shows the dashed
   * mask (it is what a CNIC looks like on the card), and `formatCNICInput`
   * produces that; a user pasting "42101 2345678 9" or a spaced variant is
   * normalised the same way, so the stored value is always the 13 digits.
   */
  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = "Name is required";
    if (!isEdit && !normalizeCNIC(form.cnic)) e.cnic = CONTACT_VALIDATION_LABEL.cnicRequired;
    else {
      const cnicProblem = cnicError(form.cnic);
      if (cnicProblem) e.cnic = cnicProblem;
    }
    if (form.current_salary.trim() && (!Number.isFinite(Number(form.current_salary)) || Number(form.current_salary) <= 0)) e.current_salary = "Enter a positive salary, or leave it blank until payroll is configured";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email address";
    if (form.send_invite && !form.email.trim()) e.email = "Email is required for portal access";
    const phoneProblem = phoneError(form.phone);
    if (phoneProblem) e.phone = phoneProblem;
    if (form.emergency_contact.trim()) {
      const ecProblem = phoneError(form.emergency_contact);
      if (ecProblem) e.emergency_contact = "Invalid contact";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const data: Record<string, unknown> = {
        full_name: form.full_name.trim(),
        // The mask is gone by the time it leaves: the server and the column both
        // want the 13 bare digits, and `normalizeCNIC` is the one place that is
        // decided.
        cnic: normalizeCNIC(form.cnic),
        email: form.email.trim() || undefined,
        // Respect the checkbox: an email alone only makes the employee
        // contactable. Portal access is opt-in, exactly as the field explains.
        send_invite: !isEdit && form.send_invite,
        phone: form.phone.trim() || undefined,
        designation: form.designation.trim() || undefined,
        department: form.department.trim() || undefined,
        employment_type: form.employment_type || undefined,
        work_location: form.work_location.trim() || undefined,
        reporting_manager_uuid: isEdit ? (form.reporting_manager_uuid || undefined) : undefined,
        status: form.status,
        joining_date: form.joining_date || undefined,
        emergency_contact: form.emergency_contact.trim() || undefined,
      };
      if (canSelectOrg && form.organization_uuid) {
        data.organization_uuid = form.organization_uuid;
      }
      if (!isEdit) {
        if (form.current_salary.trim()) data.current_salary = Number(form.current_salary);
      }
      if (isEdit) {
        await api.update(editing.uuid, data);
        if (stagedDocs.length) {
          await uploadStagedDocs(editing.uuid);
        }
        toast.success("Employee updated");
      } else {
        const createdRes = await api.create(data);
        const newUuid = createdRes?.employee?.uuid;
        // Saving an employee that carries an email already created their
        // platform account and emailed a set-password link, so there is no
        // separate "invite" step any more. A returning employee is different:
        // their existing account was linked, so no email was sent.
        const created = createdRes?.linked_existing_account
          ? "Employee created — existing platform account linked."
          : form.email.trim()
            ? "Employee created — set-password link emailed to them."
            : "Employee created.";

        if (stagedDocs.length && newUuid) {
          try {
            await uploadStagedDocs(newUuid);
            toast.success(created);
          } catch (uploadErr) {
            // The employee row already exists, so we must NOT leave the create
            // dialog open — saving again would create a duplicate employee.
            // Close, and say plainly that only the document upload failed.
            setStagedDocs([]);
            onDone();
            toast.error(
              `Employee was created, but the document upload failed (${apiErrorMessage(
                uploadErr,
                "unknown error"
              )}). Open the employee and add the document again.`
            );
            return;
          }
        } else {
          toast.success(created);
        }

        // The invite e-mail is sent after the DB commit, so a mail failure is
        // reported separately — the employee exists either way.
        if (createdRes?._email_warning) {
          toast.error(createdRes._email_warning);
        }
      }
      setStagedDocs([]);
      onDone();
    } catch (err) {
      toast.error(apiErrorMessage(err, "Save failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const orgs = useQuery({
    queryKey: ["admin-orgs-select"],
    queryFn: () => adminService.organizations({ limit: 200 }),
    enabled: canSelectOrg && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-h-[90dvh] max-w-none overflow-y-auto overscroll-contain p-4 sm:w-full sm:max-w-2xl sm:p-6">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Employee" : "Add Employee"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <h3 className="border-b pb-1 text-sm font-semibold">Identity</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Enter full name"
              />
              {errors.full_name && <p className="text-xs text-destructive">{errors.full_name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>CNIC {isEdit ? "" : "*"}</Label>
              <Input
                value={formatCNIC(form.cnic)}
                onChange={(e) => setForm({ ...form, cnic: formatCNIC(e.target.value) })}
                placeholder="XXXXX-XXXXXXX-X"
                disabled={isEdit}
                inputMode="numeric"
              />
              {errors.cnic && <p className="text-xs text-destructive">{errors.cnic}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                aria-invalid={Boolean(errors.email)}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@example.com"
              />
              {errors.email ? <p className="text-xs text-destructive">{errors.email}</p> : null}
              {!isEdit && <p className="text-xs text-muted-foreground">Email is for contact unless portal access is explicitly enabled below.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="03XX XXX XXXX"
                aria-invalid={Boolean(errors.phone)}
              />
              {errors.phone ? <p className="text-xs text-destructive">{errors.phone}</p> : null}
            </div>
          </div>
          {!isEdit && <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <input type="checkbox" checked={form.send_invite} disabled={userManagementLocked || !form.email.trim()} onChange={(e) => setForm({ ...form, send_invite: e.target.checked })} className="mt-0.5" />
            <span><span className="font-medium">Portal access / send invitation</span><span className="block text-xs text-muted-foreground">Requires a valid email. Turn off to create a roster-only employee with no login account.</span></span>
          </label>}
          {userManagementLocked && !isEdit ? <p className="text-xs text-muted-foreground">Your organization plan or permissions do not currently allow portal accounts.</p> : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Emergency Contact</Label>
              <Input
                value={form.emergency_contact}
                onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })}
                placeholder="+92 300 0000000"
              />
              {errors.emergency_contact && (
                <p className="text-xs text-destructive">{errors.emergency_contact}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Joining Date</Label>
              <Input
                type="date"
                value={form.joining_date}
                onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Designation</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setManageType("designation")}
                >
                  Manage
                </button>
              </div>
              <Select value={form.designation} onValueChange={(v) => setForm({ ...form, designation: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select designation" />
                </SelectTrigger>
                <SelectContent>
                  {(designationsQ.data ?? []).map((d: ManagedOption) => (
                    <SelectItem key={d.uuid} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Department</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setManageType("department")}
                >
                  Manage
                </button>
              </div>
              <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {(departmentsQ.data ?? []).map((d: ManagedOption) => (
                    <SelectItem key={d.uuid} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <h3 className="border-b pb-1 pt-1 text-sm font-semibold">Employment</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Employment Type</Label><Select value={form.employment_type} onValueChange={(v) => setForm({ ...form, employment_type: v })}><SelectTrigger><SelectValue placeholder="Select employment type" /></SelectTrigger><SelectContent><SelectItem value="full_time">Full-time</SelectItem><SelectItem value="part_time">Part-time</SelectItem><SelectItem value="contract">Contract</SelectItem><SelectItem value="temporary">Temporary</SelectItem><SelectItem value="intern">Intern</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Work Location</Label><Input value={form.work_location} onChange={(e) => setForm({ ...form, work_location: e.target.value })} placeholder="Office / site / remote" /></div>
          </div>
          {isEdit ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Reporting Manager</Label>
                <Select
                  value={form.reporting_manager_uuid || "none"}
                  onValueChange={(v) =>
                    setForm({ ...form, reporting_manager_uuid: v === "none" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No reporting manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No reporting manager</SelectItem>
                    {(managersQ.data?.items ?? [])
                      .filter(
                        (manager) =>
                          manager.uuid !== editing?.uuid &&
                          isCurrentEmployee(manager.status)
                      )
                      .map((manager) => (
                        <SelectItem key={manager.uuid} value={manager.uuid}>
                          {manager.full_name}
                          {manager.employee_code ? ` (${manager.employee_code})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="self-end text-xs text-muted-foreground">
                Workdays and payroll rules follow the confirmed organization schedule.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Workdays and payroll rules follow the confirmed organization schedule.
            </p>
          )}
          {!isEdit ? <h3 className="border-b pb-1 pt-1 text-sm font-semibold">Payroll Setup</h3> : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!isEdit && (
              <div className="space-y-1.5">
                <Label>Starting Basic Salary</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.current_salary}
                  onChange={(e) => setForm({ ...form, current_salary: e.target.value })}
                  placeholder="0.00"
                />
                {errors.current_salary ? <p className="text-xs text-destructive">{errors.current_salary}</p> : null}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as EmployeeRecord["status"] })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {/* Editing offers the extra "Inactive" state; creating does not.
                      A brand-new employee has no access to deactivate yet. */}
                  {(isEdit ? EDIT_STATUS_OPTIONS : CREATE_STATUS_OPTIONS).map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {canSelectOrg && (
            <div className="space-y-1.5">
              <Label>Organization</Label>
              <Select
                value={form.organization_uuid}
                onValueChange={(v) => setForm({ ...form, organization_uuid: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {(orgs.data?.items ?? []).map((org: Organization) => (
                    <SelectItem key={org.uuid} value={org.uuid}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="min-w-0 max-w-full space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Documents</Label>
              <span className="text-xs text-muted-foreground">
                Each file up to 10MB
              </span>
            </div>
            <EmployeeDocPicker
              docs={stagedDocs}
              onChange={setStagedDocs}
              onUpload={isEdit ? () => uploadDocsMut.mutate() : undefined}
              uploading={uploadDocsMut.isPending}
              note={
                !isEdit && stagedDocs.length > 0
                  ? `${stagedDocs.length} doc(s) selected — they will be uploaded after you save the employee.`
                  : undefined
              }
              className="max-w-full"
            />
            {isEdit && (
              <div className="space-y-1.5">
                {docsQ.isLoading && <p className="text-xs text-muted-foreground">Loading documents…</p>}
                {(docsQ.data ?? []).map((doc: EmployeeDocument) => (
                  <div key={doc.uuid} className="flex min-w-0 flex-col gap-2 rounded-md border border-border px-2 py-1.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {doc.document_type && (
                          <>
                            <span className="font-medium">{doc.document_type}</span>
                            <span className="mx-1 text-muted-foreground">—</span>
                          </>
                        )}
                        {doc.file_name}
                      </span>
                      {doc.file_size ? (
                        <span className="shrink-0 text-xs text-muted-foreground">({formatFileSize(doc.file_size)})</span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button asChild size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="View document">
                        <ProtectedDocumentLink
                          storedPath={doc.file_path}
                          fileName={doc.file_name}
                          mode="view"
                        >
                          <Eye className="h-4 w-4" />
                        </ProtectedDocumentLink>
                      </Button>
                      <Button asChild size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Download document">
                        <ProtectedDocumentLink
                          storedPath={doc.file_path}
                          fileName={doc.file_name}
                          mode="download"
                        >
                          <Download className="h-4 w-4" />
                        </ProtectedDocumentLink>
                      </Button>
                      {canDelete ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteDocMut.mutate(doc.uuid)}
                          loading={deleteDocMut.isPending && deleteDocMut.variables === doc.uuid}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {(docsQ.data ?? []).length === 0 && !docsQ.isLoading && (
                  <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={submitting}>
            {isEdit ? "Save Changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ManageOptionsDialog
        open={manageType !== null}
        onOpenChange={(o) => !o && setManageType(null)}
        type={manageType}
      />
    </Dialog>
  );
}





