import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Briefcase, Plus, Trash2 } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { FormDialog } from "@/components/hr/FormDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { RecruitmentTabs } from "@/components/hr/RecruitmentTabs";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import {
  JOB_STATUS_VARIANT,
  jobOpeningsService,
  orgService,
  type EmploymentType,
  type JobOpening,
  type JobStatus,
} from "@/services";
import { apiErrorMessage, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/recruitment/openings")({
  head: () => ({ meta: [{ title: "Job Openings — Dverif" }] }),
  component: OpeningsPage,
});

/**
 * Which openings still accept applications, and how many seats each has left.
 *
 * AN OPENING IS NEVER DELETED. Closing it stops new applications and hides it from
 * the pipeline picker, which is why "closed" is a status rather than a row action
 * that removes it: the list of people who applied to a role is a record that has to
 * survive the role being filled. A hard delete here would take the candidate rows
 * with it, and that history is the module's whole point.
 *
 * Vacancies are checked against `hired_count`, not trusted as a number on its own —
 * an opening at 1 vacancy with 1 hire shows 0 remaining, and the board refuses
 * further hires until the figure is raised. That is the server's rule; the
 * Remaining column is here so the recruiter can see the wall before the server hits
 * them with it.
 */
export function OpeningsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<JobOpening | null>(null);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<"department" | "designation" | null>(null);

  const list = useQuery({
    queryKey: ["recruitment-openings"],
    queryFn: () => jobOpeningsService.list(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["recruitment-openings"] });

  /**
   * Open/close is a status flip, not a delete.
   *
   * Deleting an opening would cascade away the applications filed against it, so the
   * only destructive-sounding control on this page is one that makes the row stop
   * accepting people — which is reversible, and is labelled as such.
   */
  const setStatus = useMutation({
    mutationFn: (v: { uuid: string; status: JobStatus }) =>
      jobOpeningsService.update(v.uuid, { status: v.status }),
    onSuccess: (_, v) => {
      invalidate();
      toast.success(
        v.status === "open" ? t("recruitment.openingUpdated") : t("recruitment.openingUpdated"),
      );
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("recruitment.openingActionFailed"))),
  });

  const rows = useMemo(() => {
    const items = list.data ?? [];
    const needle = search.trim().toLowerCase();
    return needle
      ? items.filter(
          (o) =>
            o.title.toLowerCase().includes(needle) ||
            (o.department_name ?? "").toLowerCase().includes(needle) ||
            (o.designation_name ?? "").toLowerCase().includes(needle),
        )
      : items;
  }, [list.data, search]);

  const columns: DataTableColumn<JobOpening>[] = [
    {
      key: "title",
      header: t("recruitment.openingTitle"),
      render: (o) => (
        <div>
          <p className="font-medium">{o.title}</p>
          <p className="text-xs text-muted-foreground">
            {[o.department_name, o.designation_name].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "location",
      header: t("recruitment.location"),
      render: (o) => o.location ?? "—",
    },
    {
      key: "employment_type",
      header: t("recruitment.employmentType"),
      render: (o) => t(`recruitment.employmentTypeLabel.${o.employment_type}`),
    },
    {
      key: "vacancies",
      header: t("recruitment.vacancies"),
      render: (o) => (
        <span className="font-mono text-xs">
          {o.hired_count} / {o.vacancies}
        </span>
      ),
    },
    {
      key: "candidates",
      header: t("recruitment.candidatesCount"),
      render: (o) => <span className="font-mono text-xs">{o.candidate_count}</span>,
    },
    {
      key: "status",
      header: t("recruitment.status"),
      render: (o) => (
        <Badge variant={JOB_STATUS_VARIANT[o.status]}>
          {t(`recruitment.jobStatusLabel.${o.status}`)}
        </Badge>
      ),
    },
    {
      key: "created_at",
      header: t("recruitment.appliedOn"),
      render: (o) => (
        <span className="text-xs text-muted-foreground">{formatDate(o.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: t("recruitment.actions"),
      headerClassName: "w-[260px] text-center",
      className: "w-[260px] text-center",
      render: (o) => (
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditing(o)}>
            {t("recruitment.editOpening")}
          </Button>
          {o.status === "open" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ uuid: o.uuid, status: "closed" })}
            >
              {t("recruitment.closeOpening")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ uuid: o.uuid, status: "open" })}
            >
              {t("recruitment.reactivateOpening")}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <ModuleGate module="recruitment_management">
      <div className="space-y-4">
        <PageHeader
          title={t("recruitment.openingsTitle")}
          description={t("recruitment.openingsDescription")}
          actions={<Button onClick={() => setCreating(true)}>{t("recruitment.newOpening")}</Button>}
        />

        <RecruitmentTabs />

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("recruitment.searchOpenings")}
        />

        <DataTable
          columns={columns}
          rows={rows}
          loading={list.isLoading}
          emptyIcon={Briefcase}
          emptyTitle={t("recruitment.noOpenings")}
          emptyDescription={t("recruitment.noOpeningsDescription")}
          emptyAction={
            <Button onClick={() => setCreating(true)}>{t("recruitment.newOpening")}</Button>
          }
        />
      </div>

      <OpeningDialog
        open={creating || Boolean(editing)}
        opening={editing}
        onManage={setManaging}
        onOpenChange={(v) => {
          if (!v) {
            setCreating(false);
            setEditing(null);
          }
        }}
        onDone={invalidate}
      />
      <ManageOpeningOptionsDialog type={managing} onOpenChange={(open) => !open && setManaging(null)} />
    </ModuleGate>
  );
}

// ---------------------------------------------------------------------------

type OpeningForm = {
  title: string;
  department_name: string;
  designation_name: string;
  location: string;
  employment_type: EmploymentType;
  vacancies: string;
  description: string;
  status: JobStatus;
};

/**
 * Departments and designations are entered BY NAME and resolved to ids on submit.
 *
 * The client has no department/designation lookup to bind to, and inventing free text
 * into what is a foreign key would create orphaned rows the moment a typo was typed.
 * The server normalises these against the tenant's existing departments and
 * designations, creating neither on a typo — so the honest client is a text field
 * that says what it is, not a numeric id field the user cannot fill.
 */
function OpeningDialog({
  open,
  opening,
  onManage,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  opening: JobOpening | null;
  onManage: (type: "department" | "designation") => void;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = Boolean(opening);
  const openingDetails = useQuery({
    queryKey: ["recruitment-opening", opening?.uuid],
    queryFn: () => jobOpeningsService.get(opening!.uuid),
    enabled: open && isEdit,
  });
  const currentOpening = openingDetails.data ?? opening;
  const departments = useQuery({
    queryKey: ["org-departments"],
    queryFn: () => orgService.departments.list(),
  });
  const designations = useQuery({
    queryKey: ["org-designations"],
    queryFn: () => orgService.designations.list(),
  });

  const form = useForm<OpeningForm>({
    defaultValues: {
      title: "",
      department_name: "",
      designation_name: "",
      location: "",
      employment_type: "full_time",
      vacancies: "1",
      description: "",
      status: "open",
    },
  });
  const { reset } = form;

  useEffect(() => {
    reset({
      title: currentOpening?.title ?? "",
      department_name: currentOpening?.department_name ?? "",
      designation_name: currentOpening?.designation_name ?? "",
      location: currentOpening?.location ?? "",
      employment_type: currentOpening?.employment_type ?? "full_time",
      vacancies: String(currentOpening?.vacancies ?? 1),
      description: currentOpening?.description ?? "",
      status: currentOpening?.status ?? "open",
    });
  }, [currentOpening, reset]);

  const save = useMutation({
    mutationFn: (values: OpeningForm) => {
      // Vacancies as a STRING so an empty field survives to the decision below,
      // rather than `Number("")` quietly becoming 0.
      const vacancies = values.vacancies.trim() ? Number(values.vacancies) : null;
      if (isEdit) {
        return jobOpeningsService.update(opening!.uuid, {
          title: values.title,
          department_name: values.department_name,
          designation_name: values.designation_name,
          employment_type: values.employment_type,
          location: values.location,
          description: values.description,
          status: values.status,
          // `undefined` leaves it alone; an explicit number is how it is changed.
          ...(vacancies != null ? { vacancies } : {}),
        });
      }
      return jobOpeningsService.create({
        title: values.title,
        department_name: values.department_name,
        designation_name: values.designation_name,
        employment_type: values.employment_type,
        location: values.location,
        description: values.description,
        status: values.status,
        ...(vacancies != null ? { vacancies } : {}),
      });
    },
    onSuccess: () => {
      onDone();
      onOpenChange(false);
      toast.success(t(isEdit ? "recruitment.openingUpdated" : "recruitment.openingCreated"));
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("recruitment.openingActionFailed"))),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      title={t(isEdit ? "recruitment.editOpening" : "recruitment.newOpening")}
      submitLabel={t("recruitment.save")}
      cancelLabel={t("recruitment.cancel")}
      onSubmit={(v) => save.mutate(v)}
    >
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.openingTitle")} *</span>
          <input
            {...form.register("title", { required: true })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="flex items-center justify-between">
            <span className="font-medium">{t("recruitment.department")} *</span>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => onManage("department")}>Manage</button>
          </span>
          <select
            {...form.register("department_name", { required: true })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            disabled={departments.isLoading}
          >
            <option value="">{departments.isLoading ? t("common.loading") : t("recruitment.selectDepartment", "Select department")}</option>
            {currentOpening?.department_name && !(departments.data ?? []).some((d) => d.name === currentOpening.department_name) ? (
              <option value={currentOpening.department_name}>{currentOpening.department_name}</option>
            ) : null}
            {(departments.data ?? []).map((department) => (
              <option key={department.uuid} value={department.name}>{department.name}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="flex items-center justify-between">
            <span className="font-medium">{t("recruitment.designation")} *</span>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => onManage("designation")}>Manage</button>
          </span>
          <select
            {...form.register("designation_name", { required: true })}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            disabled={designations.isLoading}
          >
            <option value="">{designations.isLoading ? t("common.loading") : t("recruitment.selectDesignation", "Select designation")}</option>
            {currentOpening?.designation_name && !(designations.data ?? []).some((d) => d.name === currentOpening.designation_name) ? (
              <option value={currentOpening.designation_name}>{currentOpening.designation_name}</option>
            ) : null}
            {(designations.data ?? []).map((designation) => (
              <option key={designation.uuid} value={designation.name}>{designation.name}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.location")} *</span>
          <input
            {...form.register("location", { required: true })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.employmentType")} *</span>
          <select
            {...form.register("employment_type", { required: true })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {(
              ["full_time", "part_time", "contract", "internship", "temporary"] as EmploymentType[]
            ).map((v) => (
              <option key={v} value={v}>
                {t(`recruitment.employmentTypeLabel.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.vacancies")} *</span>
          <input
            type="number"
            min={1}
            {...form.register("vacancies", { required: true, min: 1 })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.descriptionLabel")} *</span>
          <textarea
            {...form.register("description", { required: true })}
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </label>
      </div>
    </FormDialog>
  );
}

function ManageOpeningOptionsDialog({
  type,
  onOpenChange,
}: {
  type: "department" | "designation" | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const isDepartment = type === "department";
  const queryKey = [isDepartment ? "org-departments" : "org-designations"];
  const optionsQuery = useQuery({
    queryKey,
    queryFn: () => (isDepartment ? orgService.departments.list() : orgService.designations.list()),
    enabled: type !== null,
  });
  const create = useMutation({
    mutationFn: (value: string) =>
      isDepartment ? orgService.departments.create(value) : orgService.designations.create(value),
    onSuccess: () => {
      setName("");
      void qc.invalidateQueries({ queryKey });
      toast.success(`${isDepartment ? "Department" : "Designation"} added`);
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not add item")),
  });
  const remove = useMutation({
    mutationFn: (uuid: string) =>
      isDepartment ? orgService.departments.remove(uuid) : orgService.designations.remove(uuid),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey });
      toast.success("Removed");
    },
    onError: (error) => toast.error(apiErrorMessage(error, "Could not remove item")),
  });

  return (
    <Dialog open={type !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isDepartment ? "Manage Departments" : "Manage Designations"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`New ${isDepartment ? "department" : "designation"} name`}
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) create.mutate(name.trim());
              }}
            />
            <Button onClick={() => name.trim() && create.mutate(name.trim())} loading={create.isPending}>
              <Plus className="mr-1.5 h-4 w-4" /> Add
            </Button>
          </div>
          <div className="max-h-60 space-y-1.5 overflow-y-auto">
            {(optionsQuery.data ?? []).map((option) => (
              <div key={option.uuid} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-sm">
                <span className="truncate">{option.name}</span>
                {user?.org_role === "org_admin" ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => remove.mutate(option.uuid)}
                    loading={remove.isPending && remove.variables === option.uuid}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ))}
            {!optionsQuery.isLoading && (optionsQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No items yet.</p>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
