import { createFileRoute, Link, useParams, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Calculator, Download, Eye, FileUp, FileSignature, Lock, Mail, Phone, Pencil, Plus, Save, Trash2, Upload, UserRound, X, BriefcaseBusiness, Building2, CalendarDays } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmployeeDocPicker, type StagedDoc } from "@/components/employees/EmployeeDocPicker";
import { ManageOptionsDialog } from "@/components/employees/ManageOptionsDialog";

import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AccessDenied } from "@/components/common/RequireOrgFeature";
import { useAuth } from "@/lib/auth";
import { ProtectedDocumentLink } from "@/components/common/ProtectedDocumentLink";
import { usePermissions } from "@/lib/permissions";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { ModuleFeatureLockedCard } from "@/components/common/SubscriptionLocked";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isCurrentEmployee, orgService, orgEmployeeSalaryService, salaryComponentService, hrLettersService, letterTemplatesService, HR_LETTER_TYPES, type EmployeeDocument, type EmployeeRecord, type EmployeeSalaryComponent, type SalaryComponent, type SalaryHistoryEntry, type HrLetterListItem, type HrLetterType, type UUID } from "@/services";
import {
  digitsOnly,
  formatCNIC,
  formatDate,
  formatDateTime,
  formatFileSize,
  normalizeDateInputValue,
  resolveAssetUrl,
} from "@/lib/utils";
import { DverifLoader } from "@/components/common/DvarifLoader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IssueLetterDialog } from "@/components/hr/IssueLetterDialog";

export const Route = createFileRoute("/_app/org/team/$uuid")({
  validateSearch: (search: Record<string, unknown>): { edit?: boolean; salary?: boolean } => ({
    edit: search.edit === true || undefined,
    salary: search.salary === true || undefined,
  }),
  head: () => ({ meta: [{ title: "Employee — Dverif" }] }),
  component: EmployeeDetailPage,
});

/** Every status an employee can hold, including 'inactive' — which is settable
 *  here because this page only ever edits an EXISTING employee. Kept in step with
 *  EmployeeManager's option lists; 'resigned'/'terminated' are gone, folded into
 *  'ex_employee' when record_type was merged into status. */
const STATUS_OPTIONS: { value: EmployeeRecord["status"]; label: string }[] = [
  { value: "current_employee", label: "Current Employee" },
  { value: "active", label: "Active" },
  { value: "ex_employee", label: "Ex-Employee" },
  { value: "inactive", label: "Inactive (deactivated)" },
];

const STATUS_LABELS: Record<string, string> = {
  current_employee: "Current Employee",
  ex_employee: "Ex-Employee",
  active: "Active",
  inactive: "Inactive",
};

function statusLabel(status: EmployeeRecord["status"]) {
  return STATUS_LABELS[status] ?? status;
}

function statusBadgeClass(status: EmployeeRecord["status"]) {
  switch (status) {
    case "current_employee":
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

function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { message?: string } } };
  return err?.response?.data?.message ?? fallback;
}

function EmployeeDetailPage() {
  const { uuid } = useParams({ from: "/_app/org/team/$uuid" });
  const search = useSearch({ from: "/_app/org/team/$uuid" });
  const qc = useQueryClient();
  const [editing, setEditing] = useState(search.edit === true);
  const perms = usePermissions();
  const { isLocked, isModuleFlagOff } = useOrgSubscription();

  const empQ = useQuery({
    queryKey: ["org-employee", uuid],
    queryFn: () => orgService.getEmployee(uuid),
  });
  const docsQ = useQuery({
    queryKey: ["emp-docs-detail", uuid],
    queryFn: () => orgService.employeeDocuments.list(uuid),
    enabled: !!uuid,
  });

  const emp = empQ.data;
  const docs = docsQ.data ?? [];

  const departmentsQ = useQuery({
    queryKey: ["org-departments"],
    queryFn: () => orgService.departments.list(),
  });
  const designationsQ = useQuery({
    queryKey: ["org-designations"],
    queryFn: () => orgService.designations.list(),
  });
  const managersQ = useQuery({
    queryKey: ["org-employee-managers", emp?.organization_id],
    queryFn: () => orgService.employees({ limit: 1000 }),
    enabled: editing,
  });

  const original = {
    full_name: emp?.full_name ?? "",
    email: emp?.email ?? "",
    phone: emp?.phone ?? "",
    designation: emp?.designation ?? "",
    department: emp?.department ?? "",
    reporting_manager_uuid: emp?.reporting_manager_uuid ?? "",
    status: (emp?.status ?? "active") as EmployeeRecord["status"],
    joining_date: normalizeDateInputValue(emp?.joining_date),
    emergency_contact: emp?.emergency_contact ?? "",
  };

  const [form, setForm] = useState(original);
  const [stagedDocs, setStagedDocs] = useState<StagedDoc[]>([]);
  /**
   * Which managed-options dialog is open, if any.
   *
   * Added because the picker could only ever offer what already existed. With no
   * way to create from here, correcting a wrong department meant leaving the form
   * to go somewhere else and come back, and on this page there was no link at all,
   * so the only remaining option was to pick from a list that may not contain the
   * right answer.
   */
  const [manageType, setManageType] = useState<"department" | "designation" | null>(null);

  // Reset form once employee data loads (initially original has empty defaults).
  useEffect(() => {
    if (emp?.uuid) setForm(original);
  }, [emp?.uuid]);

  // Reset staged documents when leaving edit mode.
  useEffect(() => {
    if (!editing) setStagedDocs([]);
  }, [editing]);

  const isFormDirty = (Object.keys(original) as (keyof typeof original)[]).some(
    (k) => form[k] !== original[k]
  );
  const hasPendingDocs = stagedDocs.length > 0;
  const isDirty = isFormDirty || hasPendingDocs;

  const uploadDocsMut = useMutation({
    mutationFn: async () => {
      for (const d of stagedDocs) {
        const fd = new FormData();
        fd.append("documents", d.file);
        if (d.name.trim()) fd.append("document_type", d.name.trim());
        await orgService.employeeDocuments.upload(uuid, fd);
      }
    },
    onSuccess: () => {
      setStagedDocs([]);
      docsQ.refetch();
      toast.success("Documents uploaded");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Upload failed")),
  });

  const updateMut = useMutation({
    mutationFn: (data: Record<string, unknown>) => orgService.updateEmployee(uuid, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-employee", uuid] });
      qc.invalidateQueries({ queryKey: ["org-employees"] });
      toast.success("Employee updated");
      setEditing(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Save failed")),
  });

  const save = async () => {
    if (hasPendingDocs) {
      try {
        await uploadDocsMut.mutateAsync();
      } catch {
        return; // Upload failed — toast already shown.
      }
    }
    const data: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || undefined,
      phone: form.phone.trim() || undefined,
      // null, NOT undefined. The server guards these two with
      // `if (designation !== undefined)`, so `undefined` drops the key from the
      // JSON entirely and the update is skipped, which reads as "this field
      // cannot be cleared". null reaches resolveMetaId, which resolves it to NULL
      // and clears the column. Same shape as reporting_manager_uuid below.
      designation: form.designation.trim() || null,
      department: form.department.trim() || null,
      reporting_manager_uuid: form.reporting_manager_uuid || null,
      status: form.status,
      joining_date: form.joining_date || undefined,
      emergency_contact: form.emergency_contact.trim() || undefined,
    };
    updateMut.mutate(data);
  };

  if (!perms.isOrgAdmin && !perms.manage_employees) return <AccessDenied feature="manage_employees" />;

  const moduleLocked = isModuleFlagOff("employee_management");
  if (moduleLocked) return <ModuleFeatureLockedCard feature="employee_management" />;

  return (
    <div className="space-y-6">
      <PageHeader
          title={emp?.full_name ?? "Employee"}
          description="Full employee record"
        actions={
          editing ? (
            <>
              <Button variant="ghost" disabled={isLocked} onClick={() => { setForm(original); setStagedDocs([]); setEditing(false); }}>
                Cancel
              </Button>
              <Button
                onClick={save}
                disabled={isLocked || !isDirty}
                loading={updateMut.isPending || uploadDocsMut.isPending}
              >
                <Save className="mr-1.5 h-4 w-4" /> Save
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={isLocked} onClick={() => setEditing(true)}>
              {isLocked ? <Lock className="mr-1.5 h-3.5 w-3.5" /> : <Pencil className="mr-1.5 h-3.5 w-3.5" />}
              {isLocked ? "Subscription Required" : "Edit"}
            </Button>
          )
        }
      />

      <Link
        to="/org/team"
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Back to My Team
      </Link>

      {empQ.isLoading ? (
        <DverifLoader />
      ) : !emp ? (
        <Card className="border-border/70 shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Employee not found.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={search.salary === true && isCurrentEmployee(emp.status) ? "payroll" : "profile"} className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            {isCurrentEmployee(emp.status) && (
              <TabsTrigger value="payroll">Payroll</TabsTrigger>
            )}
            {perms.hr_letters && !isModuleFlagOff("hr_letters_management") && (
              <TabsTrigger value="letters" className="gap-1.5">
                <FileSignature className="h-3.5 w-3.5" /> Letters
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="profile">
            <DisplayContent
              key={emp.uuid}
              emp={emp}
              editing={editing}
              form={form}
              setForm={setForm}
              original={original}
              designationsQ={designationsQ}
              departmentsQ={departmentsQ}
              managersQ={managersQ}
              onManageOptions={setManageType}
            />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentsCard
              uuid={uuid}
              docs={docs}
              docsQ={docsQ}
              editing={editing}
              stagedDocs={stagedDocs}
              setStagedDocs={setStagedDocs}
              onUpload={() => uploadDocsMut.mutate()}
              uploading={uploadDocsMut.isPending}
            />
          </TabsContent>

          {isCurrentEmployee(emp.status) && (
            <TabsContent value="payroll" className="space-y-4">
              {isModuleFlagOff("payroll_management") ? (
                <ModuleFeatureLockedCard feature="payroll_management" />
              ) : (
                <>
                  <SalaryHistoryCard uuid={uuid} autoOpen={search.salary === true} onHistoryChange={() => qc.invalidateQueries({ queryKey: ["org-employee", uuid] })} />
                  <SalaryComponentsCard uuid={uuid} />
                </>
              )}
            </TabsContent>
          )}

          {perms.hr_letters && !isModuleFlagOff("hr_letters_management") && (
            <TabsContent value="letters">
              <EmployeeLettersCard employeeUuid={uuid} employeeName={emp.full_name} />
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* One dialog for both lists, mounted once for the page rather than per row,
          so opening Manage from Designation and then Department cannot leave two
          copies stacked. It invalidates the shared ["org-designations"] and
          ["org-departments"] queries itself, so anything added inside it is in the
          picker the moment the dialog closes. */}
      <ManageOptionsDialog
        open={manageType !== null}
        onOpenChange={(o) => !o && setManageType(null)}
        type={manageType}
      />
      </div>
  );
}


function EmployeeLettersCard({ employeeUuid, employeeName }: { employeeUuid: UUID; employeeName: string }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [issueLetter, setIssueLetter] = useState<HrLetterListItem | null>(null);
  const [templateUuid, setTemplateUuid] = useState("");
  const [letterType, setLetterType] = useState<HrLetterType>("custom");

  const lettersQ = useQuery({
    queryKey: ["hr-letters", "employee", employeeUuid],
    queryFn: () => hrLettersService.list({ employee_uuid: employeeUuid, limit: 100 }),
  });
  const templatesQ = useQuery({
    queryKey: ["hr-letter-templates", "employee-detail"],
    queryFn: () => letterTemplatesService.list(),
    enabled: true,
  });

  const createMut = useMutation({
    mutationFn: () => hrLettersService.create({
      employee_uuid: employeeUuid,
      template_uuid: templateUuid || undefined,
      letter_type: letterType,
    }),
    onSuccess: () => {
      toast.success("Letter draft created");
      setCreateOpen(false);
      setTemplateUuid("");
      void qc.invalidateQueries({ queryKey: ["hr-letters", "employee", employeeUuid] });
      void qc.invalidateQueries({ queryKey: ["hr-letters"] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Could not create letter draft")),
  });

  const items = lettersQ.data?.items ?? [];
  const activeTemplates = (templatesQ.data?.items ?? []).filter((x) => x.is_active);

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">HR Letters</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Create, assign and issue letters for {employeeName}.</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)} disabled={templatesQ.isLoading || !(templatesQ.data?.items ?? []).some((x) => x.is_active)}>
          <Plus className="mr-1.5 h-4 w-4" /> Assign Letter
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {lettersQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading employee letters…</p>
        ) : lettersQ.isError ? (
          <p className="text-sm text-destructive">Unable to load employee letters.</p>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <FileSignature className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">No letters assigned</p>
            <p className="mt-1 text-xs text-muted-foreground">Use Assign Letter to create the first draft for this employee.</p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-lg border">
            {items.map((letter) => (
              <div key={letter.uuid} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{letter.title || HR_LETTER_TYPES.find((x) => x.key === letter.letter_type)?.label || letter.letter_type}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {letter.reference_no} · {letter.status} · {formatDate(letter.issued_at ?? letter.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={letter.status === "issued" ? "default" : letter.status === "revoked" ? "destructive" : "secondary"}>
                    {letter.status}
                  </Badge>
                  {letter.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => setIssueLetter(letter)}>Review & Issue</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign HR Letter</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Input value={employeeName} disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Letter Template</Label>
              <Select value={templateUuid} onValueChange={(v) => {
                const selected = (templatesQ.data?.items ?? []).find((x) => x.uuid === v);
                setTemplateUuid(v);
                if (selected) setLetterType(selected.letter_type);
              }}>
                <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {activeTemplates.map((tpl) => (
                    <SelectItem key={tpl.uuid} value={tpl.uuid}>{tpl.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templatesQ.isLoading ? <p className="text-xs text-muted-foreground">Loading templates…</p> : null}
              {!templatesQ.isLoading && activeTemplates.length === 0 ? <p className="text-xs text-destructive">Create an active letter template before assigning a letter.</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label>Letter Type</Label>
              <Select value={letterType} onValueChange={(v) => setLetterType(v as HrLetterType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HR_LETTER_TYPES.map((type) => <SelectItem key={type.key} value={type.key}>{type.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={createMut.isPending}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !templateUuid || templatesQ.isLoading} loading={createMut.isPending}>Create Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <IssueLetterDialog
        letter={issueLetter}
        open={!!issueLetter}
        onOpenChange={(open) => !open && setIssueLetter(null)}
        onIssued={() => {
          setIssueLetter(null);
          void qc.invalidateQueries({ queryKey: ["hr-letters", "employee", employeeUuid] });
          void qc.invalidateQueries({ queryKey: ["hr-letters"] });
        }}
      />
    </Card>
  );
}

function ManageOptionButton({
  type,
  onClick,
}: {
  type: "department" | "designation";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Manage ${type}`}
      title={`Manage ${type}`}
      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/30 bg-primary/5 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={onClick}
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

function DetailRow({
  label,
  value,
  editing,
  input,
  labelAction,
}: {
  label: string;
  value: ReactNode;
  editing?: boolean;
  input?: ReactNode;
  /**
   * Optional control beside the label: the add button on the rows whose value is
   * picked from a list the org admin also maintains.
   *
   * Rendered only while editing, because that is when the choice is being made.
   */
  labelAction?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground sm:w-44 sm:shrink-0">
        {label}
        {editing && labelAction ? labelAction : null}
      </span>
      <div className="min-w-0 flex-1 text-right text-sm text-foreground sm:text-left">
        {editing ? input : value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: EmployeeRecord["status"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(status)}`} />
      {statusLabel(status)}
    </span>
  );
}

function statusDotClass(status: EmployeeRecord["status"]) {
  switch (status) {
    case "current_employee":
    case "active":
      return "bg-success";
    case "inactive":
      return "bg-amber-500";
    case "ex_employee":
      return "bg-blue-500";
    default:
      return "bg-muted-foreground";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DisplayContent(props: { emp: EmployeeRecord; editing: boolean; form: any; setForm: (f: any) => void; original: any; designationsQ: any; departmentsQ: any; managersQ: any; onManageOptions: (t: "department" | "designation") => void }) {
  const { emp, editing, form, setForm, designationsQ, departmentsQ, managersQ, onManageOptions } = props;

  const initials = emp.full_name
    ?.split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n.charAt(0).toUpperCase())
    .join("") ?? "?";

  const lifecycleLabel = statusLabel(emp.status);

  return (
    <div className="space-y-6">
      {/* Profile banner */}
      <Card className="overflow-hidden border-border/70 shadow-none">
        <div className="h-20 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
        <CardContent className="-mt-8 flex flex-col gap-4 sm:flex-row sm:items-end">
          <Avatar className="h-20 w-20 border-4 border-card bg-background shadow-sm">
            {emp.linked_user_profile_image && (
              <AvatarImage
                src={resolveAssetUrl(emp.linked_user_profile_image)}
                alt={emp.full_name}
                className="object-cover"
              />
            )}
            <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 sm:pb-1">
            <h1 className="text-xl font-semibold text-foreground">{emp.full_name}</h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              {emp.designation && (
                <span className="inline-flex items-center gap-1.5">
                  <BriefcaseBusiness className="h-3.5 w-3.5" />
                  {emp.designation}
                </span>
              )}
              {emp.designation && emp.department && <span>•</span>}
              {emp.department && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {emp.department}
                </span>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* The status badge already reads "Ex-Employee" for that value, so the old
                  second Ex-Employee badge beside it was pure duplication. */}
              <StatusBadge status={emp.status} />
              <Badge variant="outline" className="rounded-full border-border text-muted-foreground">
                {emp.is_platform_user === "yes" ? "Platform User" : "Local Contact"}
              </Badge>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 text-sm text-muted-foreground sm:items-end sm:pb-1">
            {emp.email && (
              <span className="inline-flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" /> {emp.email}
              </span>
            )}
            {emp.phone && (
              <span className="inline-flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" /> {emp.phone}
              </span>
            )}
            {emp.joining_date && (
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5" /> Joined {formatDate(emp.joining_date)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-none">
        <CardContent className="p-0">
          <section className="p-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserRound className="h-4 w-4" />
              </div>
              <CardTitle className="text-sm font-semibold">Personal Information</CardTitle>
            </div>
            <Separator className="my-3" />
            <div className="divide-y divide-border/70">
              <DetailRow
                label="Full Name"
                value={emp.full_name}
                editing={editing}
                input={
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  />
                }
              />
              <DetailRow label="CNIC" value={formatCNIC(emp.cnic)} />
              <DetailRow
                label="Email"
                value={emp.email ?? "—"}
                editing={editing}
                input={
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                }
              />
              <DetailRow
                label="Phone"
                value={emp.phone ?? "—"}
                editing={editing}
                input={
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: digitsOnly(e.target.value) })}
                  />
                }
              />
              <DetailRow
                label="Emergency Contact"
                value={emp.emergency_contact ?? "—"}
                editing={editing}
                input={
                  <Input
                    value={form.emergency_contact}
                    onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })}
                  />
                }
              />
            </div>
          </section>

          <Separator />

          {/* Employment details */}
          <section className="p-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BriefcaseBusiness className="h-4 w-4" />
              </div>
              <CardTitle className="text-sm font-semibold">Employment Details</CardTitle>
            </div>
            <Separator className="my-3" />
            <div className="divide-y divide-border/70">
              <DetailRow
                label="Designation"
                value={emp.designation ?? "—"}
                editing={editing}
                labelAction={
                  <ManageOptionButton
                    type="designation"
                    onClick={() => onManageOptions("designation")}
                  />
                }
                input={
                  <Select value={form.designation} onValueChange={(v) => setForm({ ...form, designation: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select designation" />
                    </SelectTrigger>
                    <SelectContent>
                      {/*
                          The employee's CURRENT value is offered even when it is not
                          in the catalogue. A designation is stored as a name and can
                          predate the list, or have been typed directly; drop it and
                          the Select shows its placeholder while `value` holds a
                          string no item matches, so saving the row untouched would
                          silently clear the designation.
                      */}
                      {form.designation &&
                      !(designationsQ.data ?? []).some(
                        (d: { uuid: string; name: string }) => d.name === form.designation,
                      ) ? (
                        <SelectItem value={form.designation}>{form.designation}</SelectItem>
                      ) : null}
                      {(designationsQ.data ?? []).map((d: { uuid: string; name: string }) => (
                        <SelectItem key={d.uuid} value={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <DetailRow
                label="Department"
                value={emp.department ?? "—"}
                editing={editing}
                labelAction={
                  <ManageOptionButton
                    type="department"
                    onClick={() => onManageOptions("department")}
                  />
                }
                input={
                  <Select value={form.department} onValueChange={(v) => setForm({ ...form, department: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {form.department &&
                      !(departmentsQ.data ?? []).some(
                        (d: { uuid: string; name: string }) => d.name === form.department,
                      ) ? (
                        <SelectItem value={form.department}>{form.department}</SelectItem>
                      ) : null}
                      {(departmentsQ.data ?? []).map((d: { uuid: string; name: string }) => (
                        <SelectItem key={d.uuid} value={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <DetailRow
                label="Reporting Manager"
                value={
                  emp.reporting_manager_name ? (
                    emp.reporting_manager_uuid ? (
                      <Link
                        to="/org/team/$uuid"
                        params={{ uuid: emp.reporting_manager_uuid }}
                        className="text-primary font-medium hover:underline"
                      >
                        {emp.reporting_manager_name}
                      </Link>
                    ) : (
                      emp.reporting_manager_name
                    )
                  ) : (
                    "—"
                  )
                }
                editing={editing}
                input={
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
                          (manager: EmployeeRecord) =>
                            manager.uuid !== emp.uuid && isCurrentEmployee(manager.status)
                        )
                        .map((manager: EmployeeRecord) => (
                          <SelectItem key={manager.uuid} value={manager.uuid}>
                            {manager.full_name}
                            {manager.employee_code ? ` (${manager.employee_code})` : ""}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                }
              />
              <DetailRow
                label="Joining Date"
                value={formatDate(emp.joining_date)}
                editing={editing}
                input={
                  <Input
                    type="date"
                    value={form.joining_date}
                    onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
                  />
                }
              />
              <DetailRow
                label="Lifecycle Status"
                value={<StatusBadge status={emp.status} />}
                editing={editing}
                input={
                  <Select
                    value={form.status}
                    onValueChange={(v) =>
                      setForm({ ...form, status: v as EmployeeRecord["status"] })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <DetailRow label="Created" value={formatDate(emp.created_at)} />
              <DetailRow label="Added By" value={emp.added_by_name ?? "—"} />
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentsCard({
  uuid,
  docs,
  docsQ,
  editing,
  stagedDocs,
  setStagedDocs,
  onUpload,
  uploading,
}: {
  uuid: UUID;
  docs: EmployeeDocument[];
  docsQ: { refetch: () => void; isLoading: boolean };
  editing: boolean;
  stagedDocs: StagedDoc[];
  setStagedDocs: (docs: StagedDoc[]) => void;
  onUpload: () => void;
  uploading: boolean;
}) {
  const { user } = useAuth();
  const canDelete = user?.org_role === "org_admin";

  const deleteMut = useMutation({
    mutationFn: (docUuid: UUID) => orgService.employeeDocuments.remove(docUuid),
    onSuccess: () => {
      docsQ.refetch();
      toast.success("Document deleted");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Delete failed")),
  });

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Documents ({docs.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {editing && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Label className="text-sm font-medium">Add Documents</Label>
            <EmployeeDocPicker
              docs={stagedDocs}
              onChange={setStagedDocs}
              onUpload={onUpload}
              uploading={uploading}
            />
          </div>
        )}

        <div className="space-y-1.5">
          {docsQ.isLoading && <p className="text-xs text-muted-foreground">Loading documents…</p>}
          {docs.map((doc) => (
            <div key={doc.uuid} className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm">
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
              <div className="flex shrink-0 items-center gap-2">
                {doc.file_size || doc.uploaded_at ? (
                  <span className="text-xs text-muted-foreground">
                    {doc.uploaded_at ? formatDateTime(doc.uploaded_at) : formatDate(doc.created_at)}
                  </span>
                ) : null}
                <Button asChild size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="View document">
                  <ProtectedDocumentLink storedPath={doc.file_path} fileName={doc.file_name} mode="view">
                    <Eye className="h-4 w-4" />
                  </ProtectedDocumentLink>
                </Button>
                <Button asChild size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Download document">
                  <ProtectedDocumentLink storedPath={doc.file_path} fileName={doc.file_name} mode="download">
                    <Download className="h-4 w-4" />
                  </ProtectedDocumentLink>
                </Button>
                {editing && canDelete && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMut.mutate(doc.uuid)}
                    loading={deleteMut.isPending && deleteMut.variables === doc.uuid}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!docsQ.isLoading && docs.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {editing ? "No documents yet. Add some above." : "No documents uploaded."}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The Effective Period as a person reads it.
 *
 * `formatDate` parses the YYYY-MM-DD string from the API using LOCAL calendar
 * fields, which is what keeps a stored 2026-10-01 on the 1st: parsing it as
 * `new Date("2026-10-01")` would treat it as UTC midnight and show the 30th to
 * anyone east of Greenwich. The backend normalises the DATE column to a
 * YYYY-MM-DD string for the same reason.
 *
 * "Current" is a LABEL, not a date. An open period has no end, and printing
 * "—" or leaving it blank reads as missing data rather than as "ongoing". The
 * caller passes the translated word, because this is a module-scope helper and
 * a component is the only place a `t()` is valid.
 */
function formatSalaryPeriod(effectiveFrom: string, effectiveTo: string | null, currentLabel: string): string {
  const fromStr = formatDate(effectiveFrom);
  if (effectiveTo) {
    return `${fromStr} — ${formatDate(effectiveTo)}`;
  }
  return `${fromStr} — ${currentLabel}`;
}

function SalaryHistoryCard({ uuid, autoOpen = false, onHistoryChange }: { uuid: UUID; autoOpen?: boolean; onHistoryChange: () => void }) {
  const { t } = useTranslation();
  /** Translated once per render and threaded into the helper; monthly rows do
   *  not each need to re-resolve the same word. */
  const effectiveCurrent = t("team.effectiveCurrent", "Current");
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isLocked } = useOrgSubscription();
  const canEdit = user?.org_role === "org_admin";
  const [incrementOpen, setIncrementOpen] = useState(autoOpen);
  const [newSalary, setNewSalary] = useState("");
  const [newEffective, setNewEffective] = useState("");
  const [editingEntry, setEditingEntry] = useState<SalaryHistoryEntry | null>(null);
  const [editSalary, setEditSalary] = useState("");
  const [editEffective, setEditEffective] = useState("");
  const [toDelete, setToDelete] = useState<SalaryHistoryEntry | null>(null);

  const historyQ = useQuery({
    queryKey: ["org-salary-history", uuid],
    queryFn: () => orgEmployeeSalaryService.history(uuid),
    enabled: !!uuid,
  });

  const invalidateHistory = () => {
    qc.invalidateQueries({ queryKey: ["org-salary-history", uuid] });
    onHistoryChange();
  };

  const incrementMut = useMutation({
    mutationFn: () =>
      orgEmployeeSalaryService.increment(uuid, {
        new_basic_salary: Number(newSalary),
        effective_from: newEffective,
      }),
    onSuccess: () => {
      toast.success("Salary incremented — previous period preserved");
      invalidateHistory();
      setIncrementOpen(false);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Increment failed")),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      orgEmployeeSalaryService.update(uuid, editingEntry!.uuid, {
        basic_salary: editSalary ? Number(editSalary) : undefined,
        effective_from: editEffective || undefined,
      }),
    onSuccess: () => {
      toast.success("Salary history updated");
      invalidateHistory();
      setEditingEntry(null);
      setEditSalary("");
      setEditEffective("");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Update failed")),
  });

  const deleteMut = useMutation({
    mutationFn: () => orgEmployeeSalaryService.remove(uuid, toDelete!.uuid),
    onSuccess: () => {
      toast.success("Salary history record deleted");
      invalidateHistory();
      setToDelete(null);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Delete failed")),
  });

  const openEdit = (h: SalaryHistoryEntry) => {
    setEditingEntry(h);
    setEditSalary(String(Number(h.basic_salary)));
    setEditEffective(h.effective_from);
  };

  const history = historyQ.data ?? [];

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Salary History</CardTitle>
          <Button size="sm" disabled={isLocked} onClick={() => setIncrementOpen(true)}>
            {isLocked ? <Lock className="mr-1 h-3.5 w-3.5" /> : null}
            {isLocked ? "Subscription Required" : "Increment Salary"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {historyQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading salary history…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No salary history yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead>Basic Salary</TableHead>
                <TableHead>Effective Period</TableHead>
                {canEdit ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.uuid}>
                  <TableCell data-label="Year" className="font-medium">{h.year}</TableCell>
                  <TableCell data-label="Basic Salary">
                    Rs. {Number(h.basic_salary).toLocaleString("en-PK")}
                  </TableCell>
                  <TableCell data-label="Effective Period" className="text-muted-foreground">
                    {formatSalaryPeriod(h.effective_from, h.effective_to, effectiveCurrent)}
                  </TableCell>
                  {canEdit ? (
                    <TableCell data-label="Actions" className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          disabled={isLocked}
                          onClick={() => openEdit(h)}
                        >
                          {isLocked ? <Lock className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={isLocked}
                          onClick={() => setToDelete(h)}
                        >
                          {isLocked ? <Lock className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={incrementOpen} onOpenChange={(o) => !o && setIncrementOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Increment Salary</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>New Basic Salary</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={newSalary}
                onChange={(e) => setNewSalary(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Effective From</Label>
              <Input
                type="date"
                value={newEffective}
                onChange={(e) => setNewEffective(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The current salary period will be closed and a new period with the new amount will
              start — your salary history is preserved.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIncrementOpen(false)} disabled={incrementMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => incrementMut.mutate()}
              disabled={Number(newSalary) <= 0 || !newEffective || incrementMut.isPending}
              loading={incrementMut.isPending}
            >
              Increment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingEntry} onOpenChange={(o) => !o && setEditingEntry(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Salary Record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Basic Salary</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={editSalary}
                onChange={(e) => setEditSalary(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Effective From</Label>
              <Input
                type="date"
                value={editEffective}
                onChange={(e) => setEditEffective(e.target.value)}
              />
            </div>
            {editingEntry?.effective_to === null ? (
              <p className="text-xs text-muted-foreground">
                This is the current active salary. Changing the effective date will adjust the
                previous period automatically.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingEntry(null)} disabled={updateMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => updateMut.mutate()}
              disabled={Number(editSalary) < 0 || updateMut.isPending}
              loading={updateMut.isPending}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete this salary record?"
        description={
          toDelete?.effective_to === null
            ? "The current active salary cannot be deleted. Edit it or use Increment Salary instead."
            : "This removes the salary period. The previous period will be extended to cover the gap."
        }
        onConfirm={() => toDelete && deleteMut.mutate()}
      />
    </Card>
  );
}

function ComponentTypeBadge({ type }: { type: "allowance" | "deduction" }) {
  return (
    <Badge
      variant="outline"
      className={
        type === "allowance"
          ? "rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
          : "rounded-full border-rose-500/30 bg-rose-500/10 text-rose-600"
      }
    >
      {type === "allowance" ? "Allowance" : "Deduction"}
    </Badge>
  );
}

function formatAmount(amount: string | number) {
  return `Rs. ${Number(amount).toLocaleString("en-PK")}`;
}

function SalaryComponentsCard({ uuid }: { uuid: UUID }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isLocked } = useOrgSubscription();
  const canManage = user?.org_role === "org_admin" || user?.org_role === "sub_admin";

  const [addOpen, setAddOpen] = useState(false);
  const [compId, setCompId] = useState("");
  const [amount, setAmount] = useState("");
  const [editingAssign, setEditingAssign] = useState<EmployeeSalaryComponent | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [toDelete, setToDelete] = useState<EmployeeSalaryComponent | null>(null);

  const assignQ = useQuery({
    queryKey: ["org-employee-salary-components", uuid],
    queryFn: () => orgEmployeeSalaryService.components(uuid),
    enabled: !!uuid,
  });
  const catalogQ = useQuery({
    queryKey: ["org-salary-components"],
    queryFn: () => salaryComponentService.list(),
    enabled: canManage,
  });

  const assignments = assignQ.data ?? [];
  const catalog = catalogQ.data ?? [];

  const assignedIds = new Set(assignments.map((a) => a.salary_component_id));
  const available = catalog.filter((c) => !assignedIds.has(c.id));
  const selectedCatalog = catalog.find((c) => String(c.id) === compId);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["org-employee-salary-components", uuid] });

  const addMut = useMutation({
    mutationFn: () =>
      orgEmployeeSalaryService.assignComponent(uuid, {
        salary_component_id: Number(compId),
        amount: Number(amount),
      }),
    onSuccess: () => {
      toast.success("Component assigned");
      invalidate();
      setAddOpen(false);
      setCompId("");
      setAmount("");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Failed to assign component")),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      orgEmployeeSalaryService.updateComponent(uuid, editingAssign!.uuid, {
        amount: Number(editAmount),
      }),
    onSuccess: () => {
      toast.success("Component updated");
      invalidate();
      setEditingAssign(null);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Update failed")),
  });

  const removeMut = useMutation({
    mutationFn: () => orgEmployeeSalaryService.removeComponent(uuid, toDelete!.uuid),
    onSuccess: () => {
      toast.success("Component removed");
      invalidate();
      setToDelete(null);
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Remove failed")),
  });

  const toggleActiveMut = useMutation({
    mutationFn: (assignment: EmployeeSalaryComponent) =>
      orgEmployeeSalaryService.updateComponent(uuid, assignment.uuid, {
        is_active: !assignment.is_active,
      }),
    onSuccess: () => {
      toast.success("Component status updated");
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Status update failed")),
  });

  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Salary Components</CardTitle>
          {canManage && (
            <Button size="sm" disabled={isLocked} onClick={() => { setCompId(""); setAmount(""); setAddOpen(true); }}>
              {isLocked ? <Lock className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
              {isLocked ? "Subscription Required" : "Add Component"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {assignQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading salary components...</p>
        ) : assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
            <Calculator className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No allowances or deductions assigned to this employee yet.
            </p>
            {canManage ? (
              <p className="text-xs text-muted-foreground">
                Use "Add Component" to assign an individual allowance/deduction with this
                employee's own amount.
              </p>
            ) : null}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.uuid} className={a.is_active ? undefined : "opacity-60"}>
                  <TableCell data-label="Name" className="font-medium text-foreground">{a.name}</TableCell>
                  <TableCell data-label="Type">
                    <ComponentTypeBadge type={a.type} />
                  </TableCell>
                  <TableCell data-label="Amount" className="text-right text-sm">
                    {a.component_is_percentage
                      ? `${Number(a.amount)}%`
                      : formatAmount(a.amount)}
                  </TableCell>
                  <TableCell data-label="Status">
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={!!a.is_active}
                          disabled={isLocked || toggleActiveMut.isPending}
                          onCheckedChange={() => toggleActiveMut.mutate(a)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {a.is_active ? "Active" : "Inactive"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {a.is_active ? "Active" : "Inactive"}
                      </span>
                    )}
                  </TableCell>
                  {canManage ? (
                    <TableCell data-label="Actions" className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-primary"
                          disabled={isLocked}
                          onClick={() => { setEditingAssign(a); setEditAmount(String(Number(a.amount))); }}
                        >
                          {isLocked ? <Lock className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          disabled={isLocked}
                          onClick={() => setToDelete(a)}
                        >
                          {isLocked ? <Lock className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Add Component */}
      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Component</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Component</Label>
              <Select value={compId} onValueChange={(v) => { setCompId(v); setAmount(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an allowance or deduction" />
                </SelectTrigger>
                <SelectContent>
                  {available.length === 0 ? (
                    <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                      No unassigned components available.
                    </div>
                  ) : (
                    available.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} — {c.type === "allowance" ? "Allowance" : "Deduction"}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            {selectedCatalog ? (
              <div className="space-y-1.5">
                <Label>Amount for this employee</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={
                    selectedCatalog.is_percentage
                      ? "% of basic salary"
                      : "0.00"
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {selectedCatalog.is_percentage
                    ? "Calculated as a percentage of the employee's basic salary."
                    : "Enter the fixed amount for this employee."}
                </p>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={addMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => addMut.mutate()}
              disabled={!compId || Number(amount) < 0 || !amount || addMut.isPending}
              loading={addMut.isPending}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit amount */}
      <Dialog open={!!editingAssign} onOpenChange={(o) => !o && setEditingAssign(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit {editingAssign?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Amount for this employee</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                placeholder={editingAssign?.component_is_percentage ? "% of basic salary" : "0.00"}
              />
              <p className="text-xs text-muted-foreground">
                {editingAssign?.component_is_percentage
                  ? "Calculated as a percentage of the employee's basic salary."
                  : "The individual amount assigned to this employee."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingAssign(null)} disabled={updateMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => updateMut.mutate()}
              disabled={Number(editAmount) < 0 || !editAmount || updateMut.isPending}
              loading={updateMut.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Remove "${toDelete?.name ?? ""}"?`}
        description="This removes this allowance/deduction assignment for this employee. Already-generated payroll is not affected."
        onConfirm={() => toDelete && removeMut.mutate()}
      />
    </Card>
  );
}
