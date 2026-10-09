import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  FileSignature,
  Plus,
  Download,
  ShieldCheck,
  Ban,
  MoreHorizontal,
  Send,
  Trash2,
  RotateCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { IssueLetterDialog } from "@/components/hr/IssueLetterDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiErrorMessage } from "@/lib/utils";
import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, DataTableToolbar, type DataTableColumn } from "@/components/hr/DataTable";
import { FormDialog } from "@/components/hr/FormDialog";
import { hrLettersService, letterTemplatesService, orgService, HR_LETTER_TYPES } from "@/services";
import type { HrLetter, HrLetterListItem, HrLetterStatus, UUID } from "@/services";

/**
 * Issued and draft HR letters.
 *
 * Plan gating is ModuleGate (hr_letters_management), NOT RequireOrgFeature:
 * letters are not delegable to sub-admins via feature_access, so the only axis
 * here is the plan. See the ROUTE_ACCESS comment for why.
 */
export const Route = createFileRoute("/_app/org/hr-letters")({
  component: HrLettersPage,
});

const STATUS_VARIANT: Record<HrLetterStatus, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  issued: "default",
  revoked: "destructive",
};

function HrLettersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | HrLetterStatus>("");
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ["hr-letters", page, search, statusFilter],
    queryFn: () =>
      hrLettersService.list({
        page,
        limit: 20,
        search: search || undefined,
        status: statusFilter || undefined,
      }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["hr-letters"] });

  // Revoke/issue/delete are owned by RowActions, which needs them per-row and
  // routes the destructive ones through a confirm dialog.
  const columns: DataTableColumn<HrLetterListItem>[] = [
    {
      key: "reference_no",
      header: t("letters.referenceNo"),
      render: (r) => <span className="font-mono text-xs">{r.reference_no}</span>,
    },
    {
      key: "employee",
      header: t("letters.employee"),
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.employee_name}</p>
          {r.employee_designation ? (
            <p className="truncate text-xs text-muted-foreground">{r.employee_designation}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "letter_type",
      header: t("letters.type"),
      render: (r) => (
        <span className="text-sm">
          {HR_LETTER_TYPES.find((x) => x.key === r.letter_type)?.label ?? r.letter_type}
        </span>
      ),
    },
    {
      key: "status",
      header: t("common.status"),
      render: (r) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
          {r.verify_url ? (
            <a
              href={r.verify_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ShieldCheck className="h-3 w-3" />
              {t("letters.viewVerification")}
            </a>
          ) : null}
        </div>
      ),
    },
    {
      key: "issued_at",
      header: t("letters.issuedAt"),
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {/* ASCII hyphen, not an em-dash: this file has been through enough
              encoding round trips that a typographic dash is a liability. */}
          {r.issued_at ? new Date(r.issued_at).toLocaleDateString("en-PK") : "-"}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      className: "text-right",
      render: (r) => <RowActions row={r} />,
    },
  ];

  return (
    <ModuleGate module="hr_letters_management">
      <div className="space-y-4">
        <PageHeader
          title={t("letters.title")}
          description={t("letters.description")}
          actions={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              {t("letters.newLetter")}
            </Button>
          }
        />

        <DataTableToolbar>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <div className="flex gap-1">
            {(["", "draft", "issued", "revoked"] as const).map((s) => (
              <Button
                key={s || "all"}
                size="sm"
                variant={statusFilter === s ? "default" : "outline"}
                onClick={() => {
                  setStatusFilter(s as HrLetterStatus | "");
                  setPage(1);
                }}
              >
                {s === "" ? t("letters.all") : s}
              </Button>
            ))}
          </div>
        </DataTableToolbar>

        {query.isError ? (
          <EmptyState
            icon={FileSignature}
            title={t("letters.loadFailed")}
            description={(query.error as Error)?.message}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={query.data?.items ?? []}
            total={query.data?.total ?? 0}
            page={page}
            totalPages={query.data?.totalPages ?? 1}
            onPageChange={setPage}
            loading={query.isLoading}
            emptyIcon={FileSignature}
            emptyTitle={t("letters.emptyTitle")}
            emptyDescription={t("letters.emptyDescription")}
            emptyAction={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                {t("letters.newLetter")}
              </Button>
            }
          />
        )}

        <CreateLetterDialog open={createOpen} onOpenChange={setCreateOpen} onDone={invalidate} />
      </div>
    </ModuleGate>
  );
}

type CreateLetterFormValues = {
  employee_uuid: string;
  template_uuid: string;
  letter_type: string;
};

/**
 * Owns the form and passes the instance down explicitly.
 *
 * Deliberately NOT useFormContext(): this component renders ABOVE FormDialog, and
 * the provider lives inside FormDialog's children, so a context read here is null
 * and crashes with "Cannot destructure property 'register' of 'useFormContext()'".
 */
/**
 * Per-row actions, driven entirely by status.
 *
 * Declaring the menu as data rather than a chain of conditionals means a new
 * status cannot accidentally leave a row with NO way to act on it — the
 * fallback case below is the safety net.
 *
 *   draft   -> Issue, Delete Draft      (issuing mints the QR and freezes the body)
 *   issued  -> Download PDF, View Verification, Revoke
 *   revoked -> Download PDF only        (the PDF carries a REVOKED watermark)
 *
 * Destructive actions route through ConfirmDialog because revoke cannot be
 * undone: it clears issued_at, which breaks the signature, so the printed QR stops
 * verifying for good.
 */
export function RowActions({ row }: { row: HrLetterListItem }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<null | "delete" | "revoke" | "revert">(null);
  /**
   * Issue opens a dialog rather than firing straight at the API. The backend
   * refuses to issue while any merge tag is unresolved, so a bare POST returned
   * 400 for any draft using a manual tag (e.g. $new_salary).
   */
  const [issuing, setIssuing] = useState(false);

  const download = useMutation({
    mutationFn: () => hrLettersService.downloadPdf(row.uuid),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoke immediately: leaving the blob URL alive pins the PDF in memory for
      // the life of the document.
      URL.revokeObjectURL(url);
    },
  });

  const remove = useMutation({
    mutationFn: () => hrLettersService.remove(row.uuid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-letters"] });
      setConfirm(null);
    },
  });

  const revoke = useMutation({
    mutationFn: (reason: string) => hrLettersService.revoke(row.uuid, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-letters"] });
      setConfirm(null);
    },
  });

  const revert = useMutation({
    mutationFn: () => hrLettersService.revertToDraft(row.uuid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-letters"] });
      setConfirm(null);
    },
  });

  const busy = download.isPending || remove.isPending || revoke.isPending || revert.isPending;
  const error = remove.error ?? revoke.error ?? revert.error ?? download.error;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={busy} title={t("common.actions")}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {row.status === "draft" ? (
            <>
              <DropdownMenuItem onSelect={() => setIssuing(true)}>
                <Send className="mr-2 h-4 w-4" />
                {t("letters.issueLetter")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirm("delete")}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("letters.deleteDraft")}
              </DropdownMenuItem>
            </>
          ) : null}

          {row.status === "issued" ? (
            <>
              <DropdownMenuItem onSelect={() => download.mutate()}>
                <Download className="mr-2 h-4 w-4" />
                {t("letters.downloadPdf")}
              </DropdownMenuItem>
              {row.verify_url ? (
                <DropdownMenuItem asChild>
                  <a href={row.verify_url} target="_blank" rel="noreferrer">
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    {t("letters.viewVerification")}
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirm("revoke")}
              >
                <Ban className="mr-2 h-4 w-4" />
                {t("letters.revoke")}
              </DropdownMenuItem>
            </>
          ) : null}

          {row.status === "revoked" ? (
            <>
              <DropdownMenuItem onSelect={() => download.mutate()}>
                <Download className="mr-2 h-4 w-4" />
                {t("letters.downloadRevokedPdf")}
              </DropdownMenuItem>
              {/* Revocation was one-way, which left HR unable to fix a letter
                  revoked over a typo: a revoked letter could be neither edited
                  into a correct draft nor issued. This is the way back. It only
                  returns the letter to draft — issuing stays a separate,
                  deliberate step with its own preview. */}
              <DropdownMenuItem onSelect={() => setConfirm("revert")}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {t("letters.revertToDraft")}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <IssueLetterDialog
        letter={row}
        open={issuing}
        onOpenChange={setIssuing}
        onIssued={() => qc.invalidateQueries({ queryKey: ["hr-letters"] })}
      />

      <ConfirmDialog
        open={confirm === "revert"}
        title={t("letters.revertToDraft")}
        description={t("letters.revertToDraftDescription")}
        confirmLabel={t("letters.revertToDraft")}
        onConfirm={async () => {
          await revert.mutateAsync();
        }}
        onOpenChange={(v) => !v && setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === "revoke"}
        title={t("letters.revoke")}
        description={t("letters.revokeDescription")}
        confirmLabel={t("letters.revoke")}
        onConfirm={async () => {
          await revoke.mutateAsync("");
        }}
        onOpenChange={(v) => !v && setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === "delete"}
        title={t("letters.deleteDraft")}
        description={t("letters.deleteDraftDescription")}
        confirmLabel={t("common.delete")}
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
        onOpenChange={(v) => !v && setConfirm(null)}
      />

      {error ? (
        <p className="mt-1 text-right text-xs text-destructive">
          {apiErrorMessage(error, t("letters.saveFailed"))}
        </p>
      ) : null}
    </>
  );
}

function CreateLetterDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const form = useForm<CreateLetterFormValues>({
    defaultValues: { employee_uuid: "", template_uuid: "", letter_type: "increment" },
  });

  // Reset on open so the previous draft's selections do not linger.
  useEffect(() => {
    if (open) form.reset({ employee_uuid: "", template_uuid: "", letter_type: "increment" });
  }, [open, form]);

  // Loaded on open rather than on mount: these lists only exist to fill the
  // dialog, and an org can have hundreds of employees.
  const options = useQuery({
    queryKey: ["hr-letter-form-options"],
    enabled: open,
    queryFn: async () => {
      const [employees, templates] = await Promise.all([
        orgService.employees({ limit: 200 }),
        letterTemplatesService.list(),
      ]);
      return {
        // employees() returns the standard { items, total, ... } envelope.
        employees: employees.items.map((e) => ({ uuid: e.uuid, full_name: e.full_name })),
        templates: templates.items,
      };
    },
  });

  const create = useMutation({
    mutationFn: hrLettersService.create,
    onSuccess: () => {
      onDone();
      onOpenChange(false);
    },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      title={t("letters.newLetter")}
      description={t("letters.newLetterDescription")}
      submitLabel={t("letters.createDraft")}
      cancelLabel={t("common.cancel")}
      onSubmit={(values) =>
        create.mutateAsync({
          employee_uuid: String(values.employee_uuid ?? ""),
          template_uuid: values.template_uuid ? String(values.template_uuid) : undefined,
          letter_type: (values.letter_type ?? "custom") as HrLetter["letter_type"],
        })
      }
    >
      <CreateLetterFields
        form={form}
        employees={options.data?.employees ?? []}
        templates={options.data?.templates ?? []}
        error={create.isError ? apiErrorMessage(create.error, t("letters.saveFailed")) : null}
        employeeLabel={t("letters.employee")}
        selectEmployee={t("letters.selectEmployee")}
        templateLabel={t("letters.template")}
        noTemplate={t("letters.noTemplate")}
        typeLabel={t("letters.type")}
      />
    </FormDialog>
  );
}

/** Rendered INSIDE FormDialog, so it receives the form as a plain prop. */
function CreateLetterFields({
  form,
  employees,
  templates,
  error,
  employeeLabel,
  selectEmployee,
  templateLabel,
  noTemplate,
  typeLabel,
}: {
  form: UseFormReturn<CreateLetterFormValues>;
  employees: { uuid: string; full_name: string }[];
  templates: { uuid: string; name: string }[];
  error: string | null;
  employeeLabel: string;
  selectEmployee: string;
  templateLabel: string;
  noTemplate: string;
  typeLabel: string;
}) {
  return (
    <>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{employeeLabel}</span>
        <select
          {...form.register("employee_uuid", { required: selectEmployee })}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="" disabled>
            {selectEmployee}
          </option>
          {employees.map((e) => (
            <option key={e.uuid} value={e.uuid}>
              {e.full_name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{templateLabel}</span>
        <select
          {...form.register("template_uuid")}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">{noTemplate}</option>
          {templates.map((tpl) => (
            <option key={tpl.uuid} value={tpl.uuid}>
              {tpl.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{typeLabel}</span>
        <select
          {...form.register("letter_type")}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {HR_LETTER_TYPES.map((lt) => (
            <option key={lt.key} value={lt.key}>
              {lt.label}
            </option>
          ))}
        </select>
      </label>

      {/* The server's message, not axios's generic status line. */}
      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}
    </>
  );
}
