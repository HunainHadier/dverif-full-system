import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, Plus, Receipt, Upload } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { FormDialog } from "@/components/hr/FormDialog";
import { FileDropzone } from "@/components/hr/FileDropzone";
import { AttachmentCard, type AttachmentCardHandlers } from "@/components/hr/AttachmentCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import {
  CLAIM_STATUS_VARIANT,
  MAX_BACKDATE_DAYS,
  expenseCategoriesService,
  myExpensesService,
  type ClaimStatus,
  type ExpenseAttachment,
  type ExpenseClaim,
  type PaymentMode,
} from "@/services";
import { apiErrorMessage, formatCurrency, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/my-expenses")({
  head: () => ({ meta: [{ title: "My Expenses — Dverif" }] }),
  component: MyExpensesPage,
});

const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: "expenses.status.pending",
  approved: "expenses.status.approved",
  rejected: "expenses.status.rejected",
  paid: "expenses.status.paid",
};

/**
 * Employee self-service: file an expense claim and follow it.
 *
 * THERE IS NO EMPLOYEE FIELD ON THIS FORM, and that absence is the design. The
 * server derives the employee from the session, so there is nothing here that
 * could be pointed at a colleague — a reimbursement form with an employee picker
 * on it is a form that can be used to have the company pay someone else's taxi.
 *
 * AMOUNT IS THE EMPLOYEE'S OWN FIGURE, typed and never adjusted by finance from
 * this page. Finance reviews the amount as filed; if it is wrong the route is a
 * rejection with a reason and a corrected resubmission.
 *
 * `myExpensesService.create` takes no employee_uuid at all, which is the type
 * system enforcing the same rule the server does.
 */
function MyExpensesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [detailUuid, setDetailUuid] = useState<string | null>(null);

  const claims = useQuery({
    queryKey: ["my-expenses"],
    queryFn: () => myExpensesService.list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["my-expenses"] });

  const columns: DataTableColumn<ExpenseClaim>[] = [
    {
      key: "expense_date",
      header: t("expenses.expenseDate"),
      render: (r) => (
        <div className="min-w-0">
          {/* The day the money was spent, which is what decides the payroll
              month. Not the filing date — a claim sent in March for a February
              taxi belongs in February. */}
          <p className="text-sm">{formatDate(r.expense_date)}</p>
          <p className="truncate text-xs text-muted-foreground">{r.category_name ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "amount",
      header: t("expenses.amount"),
      render: (r) => <span className="font-mono text-xs">{formatCurrency(r.amount)}</span>,
    },
    {
      key: "payment_mode",
      header: t("expenses.paymentMode"),
      render: (r) => (
        <Badge variant={r.payment_mode === "payroll" ? "secondary" : "outline"}>
          {t(`expenses.mode.${r.payment_mode}`)}
        </Badge>
      ),
    },
    {
      key: "status",
      header: t("common.status"),
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <Badge variant={CLAIM_STATUS_VARIANT[r.status]}>{t(STATUS_LABEL[r.status])}</Badge>
          {!r.receipt_satisfied ? (
            <span className="text-xs text-amber-600 dark:text-amber-500">
              {t("expenses.receiptMissing")}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      /**
       * Where the claim actually is, in the employee's own words' vocabulary.
       *
       * "Approved" on its own reads as paid, and for a payroll-mode claim it is
       * not: the money goes out with the next payroll run. So this column names
       * the next event rather than repeating the status.
       */
      key: "next",
      header: t("expenses.whatNext"),
      render: (r) => {
        if (r.status === "paid") return <span className="text-xs text-muted-foreground">—</span>;
        if (r.status === "rejected") {
          return (
            <span className="text-xs text-muted-foreground">{t("expenses.resubmitHint")}</span>
          );
        }
        if (!r.receipt_satisfied) {
          return (
            <span className="text-xs text-amber-600 dark:text-amber-500">
              {t("expenses.attachReceiptHint")}
            </span>
          );
        }
        return (
          <span className="text-xs text-muted-foreground">
            {r.payment_mode === "payroll"
              ? t("expenses.awaitingPayroll")
              : t("expenses.awaitingTransfer")}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setDetailUuid(r.uuid)}>
          {t("expenses.viewDetails")}
        </Button>
      ),
    },
  ];

  return (
    <ModuleGate module="expense_management">
      <div className="space-y-4">
        <PageHeader
          title={t("myExpenses.title")}
          description={t("myExpenses.description")}
          actions={
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("myExpenses.fileClaim")}
            </Button>
          }
        />

        <DataTable
          columns={columns}
          rows={claims.data?.items ?? []}
          loading={claims.isLoading}
          emptyIcon={Receipt}
          emptyTitle={t("myExpenses.empty")}
          emptyDescription={t("myExpenses.emptyDescription")}
        />
      </div>

      <NewClaimDialog open={open} onOpenChange={setOpen} onFiled={invalidate} />

      <MyClaimDialog
        uuid={detailUuid}
        onOpenChange={(v) => !v && setDetailUuid(null)}
        onChanged={invalidate}
      />
    </ModuleGate>
  );
}

// ---------------------------------------------------------------------------
// File a claim
// ---------------------------------------------------------------------------

type ClaimForm = {
  category_uuid: string;
  amount: string;
  expense_date: string;
  description: string;
  payment_mode: PaymentMode;
};

function NewClaimDialog({
  open,
  onOpenChange,
  onFiled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFiled: () => void;
}) {
  const { t } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<ClaimForm>({
    defaultValues: {
      category_uuid: "",
      amount: "",
      expense_date: today,
      description: "",
      payment_mode: "payroll",
    },
  });
  const { reset } = form;

  const categories = useQuery({
    queryKey: ["expense-categories", false],
    queryFn: () => expenseCategoriesService.list(false),
    enabled: open,
  });

  // Reset on the closed -> open transition, so a claim started and abandoned does
  // not leave stale amounts behind for the next one.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      reset({
        category_uuid: "",
        amount: "",
        expense_date: today,
        description: "",
        payment_mode: "payroll",
      });
    }
    wasOpen.current = open;
  }, [open, reset, today]);

  const selected = (categories.data ?? []).find((c) => c.uuid === form.watch("category_uuid"));
  const limit = selected?.max_limit_per_claim ?? null;
  const amountValue = Number(form.watch("amount"));
  const overLimit = limit !== null && amountValue > 0 && amountValue > limit;

  // Advisory only. The server re-checks both of these, and it is the server's
  // answer that counts — this exists so the employee finds out before a round trip.
  const daysBack = form.watch("expense_date")
    ? Math.round(
        (new Date(`${today}T00:00:00Z`).getTime() -
          new Date(`${form.watch("expense_date")}T00:00:00Z`).getTime()) /
          86400000,
      )
    : 0;
  const tooOld = daysBack > MAX_BACKDATE_DAYS;
  const inFuture = daysBack < 0;

  const submit = useMutation({
    mutationFn: (values: ClaimForm) =>
      myExpensesService.create({
        category_uuid: values.category_uuid,
        amount: Number(values.amount),
        expense_date: values.expense_date,
        description: values.description.trim() || undefined,
        payment_mode: values.payment_mode,
      }),
    onSuccess: () => {
      onFiled();
      onOpenChange(false);
      toast.success(t("myExpenses.filedToast"));
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("myExpenses.fileFailed"))),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("myExpenses.formTitle")}
      description={t("myExpenses.formDescription")}
      submitLabel={t("myExpenses.submit")}
      cancelLabel={t("common.cancel")}
      onSubmit={(values) => submit.mutateAsync(values)}
      form={form}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("expenses.category")}</span>
        <select
          {...form.register("category_uuid", { required: t("expenses.category") })}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="">{t("expenses.chooseCategory")}</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.uuid} value={c.uuid}>
              {c.name}
            </option>
          ))}
        </select>
        {/* The receipt requirement is stated the moment a category is chosen, not
            at approval time. An employee who only learns a receipt was required
            after they have been rejected has to do the work twice. */}
        {selected?.requires_receipt ? (
          <span className="block text-xs text-muted-foreground">
            {t("expenses.requiresReceipt")}
          </span>
        ) : null}
        {selected?.description ? (
          <span className="block text-xs text-muted-foreground">{selected.description}</span>
        ) : null}
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("expenses.amount")}</span>
        <input
          {...form.register("amount", { required: t("expenses.amount") })}
          inputMode="decimal"
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        />
        {overLimit ? (
          <span className="block text-xs text-destructive">
            {t("expenses.overLimit", { amount: formatCurrency(limit!) })}
          </span>
        ) : null}
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("expenses.expenseDate")}</span>
        <input
          type="date"
          // max/today stop the two mistakes the server would refuse anyway, in the
          // one place the employee can still see why.
          max={today}
          {...form.register("expense_date", { required: t("expenses.expenseDate") })}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        />
        {inFuture ? (
          <span className="block text-xs text-destructive">{t("expenses.dateFuture")}</span>
        ) : null}
        {tooOld ? (
          <span className="block text-xs text-destructive">{t("expenses.dateTooOld")}</span>
        ) : null}
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("expenses.descriptionLabel")}</span>
        <textarea
          {...form.register("description")}
          rows={3}
          placeholder={t("expenses.descriptionPlaceholder")}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("expenses.paymentMode")}</span>
        <select
          {...form.register("payment_mode")}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="payroll">{t("expenses.mode.payroll")}</option>
          <option value="direct">{t("expenses.mode.direct")}</option>
        </select>
        {/* Stated in words, because the two labels do not tell an employee which
            one gets their money sooner — and that is the thing they are choosing. */}
        <span className="block text-xs text-muted-foreground">
          {form.watch("payment_mode") === "payroll"
            ? t("expenses.modePayrollHint")
            : t("expenses.modeDirectHint")}
        </span>
      </label>

      <p className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {t("expenses.receiptAfterSubmit")}
      </p>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// One claim, with its receipts
// ---------------------------------------------------------------------------

const EXPENSE_ATTACHMENT_HANDLERS: AttachmentCardHandlers = {
  // The SELF-SERVICE attachment routes, not the staff ones. The staff endpoints
  // are org-gated, so an employee would get a 403 from inside a card that looks
  // perfectly normal — the file would just never load, with no error shown.
  download: (uuid) => myExpensesService.downloadAttachment(uuid),
  remove: (uuid) => myExpensesService.removeAttachment(uuid),
};

function MyClaimDialog({
  uuid,
  onOpenChange,
  onChanged,
}: {
  uuid: string | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const open = Boolean(uuid);
  const [files, setFiles] = useState<File[]>([]);

  const detail = useQuery({
    queryKey: ["my-expense-claim", uuid],
    queryFn: () => myExpensesService.get(uuid!),
    enabled: open,
  });

  useEffect(() => {
    if (!open) setFiles([]);
  }, [open, uuid]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!uuid) return;
      // The self-service route, which re-proves the claim is the caller's own
      // before accepting a file.
      await myExpensesService.uploadReceipts(uuid, files);
    },
    onSuccess: () => {
      setFiles([]);
      onChanged();
      void qc.invalidateQueries({ queryKey: ["my-expense-claim", uuid] });
      toast.success(t("expenses.receiptsUploaded"));
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("expenses.uploadFailed"))),
  });

  const claim = detail.data;
  const receipts: ExpenseAttachment[] = claim?.receipts ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {claim
              ? `${claim.category_name ?? "—"} · ${formatCurrency(claim.amount)}`
              : t("loading")}
          </DialogTitle>
          <DialogDescription>
            {claim ? formatDate(claim.expense_date) : t("loading")}
          </DialogDescription>
        </DialogHeader>

        {claim ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={CLAIM_STATUS_VARIANT[claim.status]}>
                {t(STATUS_LABEL[claim.status])}
              </Badge>
              <Badge variant={claim.payment_mode === "payroll" ? "secondary" : "outline"}>
                {t(`expenses.mode.${claim.payment_mode}`)}
              </Badge>
            </div>

            {claim.description ? (
              <p className="whitespace-pre-wrap text-sm">{claim.description}</p>
            ) : null}

            {claim.rejection_reason ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive">
                  {t("expenses.rejectionReason")}
                </p>
                <p className="whitespace-pre-wrap text-sm">{claim.rejection_reason}</p>
                <p className="mt-2 text-xs text-muted-foreground">{t("expenses.resubmitHint")}</p>
              </div>
            ) : null}

            {claim.paid_at ? (
              <div className="rounded-md bg-muted/50 p-3 text-xs">
                {t("expenses.paidAt", { date: formatDate(claim.paid_at) })}
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-sm font-medium">
                {t("expenses.receipts")}
                {claim.category_requires_receipt ? (
                  <span className="ml-1 text-xs text-muted-foreground">
                    {t("expenses.receiptRequired")}
                  </span>
                ) : null}
              </p>

              {receipts.map((r) => (
                <AttachmentCard
                  key={r.uuid}
                  attachment={r}
                  handlers={EXPENSE_ATTACHMENT_HANDLERS}
                  onDeleted={() => {
                    onChanged();
                    void qc.invalidateQueries({ queryKey: ["my-expense-claim", uuid] });
                  }}
                />
              ))}

              {receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("expenses.noReceipts")}</p>
              ) : null}

              {claim.status !== "rejected" ? (
                <div className="space-y-2 pt-1">
                  <FileDropzone
                    value={files}
                    onChange={setFiles}
                    accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
                    maxFiles={5}
                    maxSizeMb={10}
                    label={t("expenses.addReceipts")}
                  />
                  <Button
                    size="sm"
                    disabled={files.length === 0 || upload.isPending}
                    onClick={() => upload.mutate()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {t("expenses.uploadReceipts")}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
