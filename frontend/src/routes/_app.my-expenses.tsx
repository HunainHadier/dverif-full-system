import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle, FolderTree, Plus, Receipt, Upload } from "lucide-react";

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
  myExpensesService,
  type ClaimStatus,
  type ExpenseAttachment,
  type ExpenseClaim,
  type PaymentMode,
} from "@/services";
import { apiErrorMessage, formatCurrency, formatDate } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";

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
  const perms = usePermissions();

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

  /*
   * The receipt, held outside react-hook-form for the same reason the CV is in
   * the candidate form: a File is not a form value. `files[0]` because an
   * expense claim takes one receipt — a stack of receipts is multiple claims,
   * each with its own amount and its own review.
   */
  const [receipt, setReceipt] = useState<File | null>(null);
  /**
   * The auto-approve checkbox.
   *
   * ENABLED ONLY FOR A ROLE THE SERVER AGREES CAN APPROVE, and that is the point
   * of the rest of this block: the checkbox is a visibility rule, never the gate.
   * The server resolves the same permission from the session, so an account that
   * cannot approve gets a pending claim even if it posts the flag by hand.
   */
  const [autoApprove, setAutoApprove] = useState(false);

  /*
   * MY categories, through MY route.
   *
   * This used to call `expenseCategoriesService.list(false)` — i.e.
   * GET /org/expense-categories — which is gated on org_admin/sub_admin plus
   * approve_expenses. A person on the roster is neither, so it 403'd, `data` stayed
   * undefined, and the dropdown rendered the empty state: "No categories found.
   * Create a new category first." Both halves were wrong. The categories existed,
   * and the page it pointed at is one they cannot open.
   *
   * The key is deliberately its own. Sharing ["expense-categories"] with the staff
   * page would let one tab's cache answer the other's query — and the two routes
   * have different permissions, so a cached staff answer could render here.
   */
  const categories = useQuery({
    queryKey: ["my-expense-categories"],
    queryFn: () => myExpensesService.categories(),
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
      setReceipt(null);
      setAutoApprove(false);
    }
    wasOpen.current = open;
  }, [open, reset, today]);

  const selected = (categories.data ?? []).find((c) => c.uuid === form.watch("category_uuid"));
  const limit = selected?.max_limit_per_claim ?? null;
  const amountValue = Number(form.watch("amount"));
  const overLimit = limit !== null && amountValue > 0 && amountValue > limit;

  /*
   * THE EMPTY CATEGORY LIST, said out loud.
   *
   * A dropdown that shows only its placeholder is indistinguishable from a
   * loading one, and an employee with no categories has no way to file anything
   * and no way to know why. So the empty case states the problem and, for
   * someone who can create one, links to where that happens.
   *
   * The link is gated on the SAME permission the backend enforces on
   * POST /org/expense-categories - `approve_expenses`. Showing an unauthorized
   * employee a "create a category" link would hand them a 403 and imply they had
   * lost some privilege, when in fact they were never going to be allowed it.
   */
  /*
   * A FAILED request is not an empty list, and must not be reported as one.
   *
   * `categoriesEmpty` deliberately excludes the error case. A dropdown with nothing
   * in it looks identical either way, so conflating them is how a permissions
   * fault presents itself as a data problem: a 403 left `data` undefined, the
   * control looked empty, and the page told the person filing that their company
   * had no categories and to go create one. Telling someone to fix a permissions
   * fault by editing data is worse than showing nothing, because they will do it
   * and it will not help. Retry is the only action that can, so it is the only one
   * offered here.
   */
  const categoriesFailed = categories.isError;
  const categoriesEmpty =
    !categories.isLoading && !categoriesFailed && (categories.data ?? []).length === 0;

  const canManageCategories = perms.isOrgAdmin || perms.approve_expenses === true;

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

  /*
   * File the claim, then attach the receipt to it.
   *
   * TWO STEPS for the same reason the candidate CV is two steps: the receipt
   * hangs off a claim row that has to exist first
   * (POST /my/expenses/:uuid/receipts). Chaining them here keeps the claim as
   * pure JSON and reuses the attachment route the claim-detail dialog already
   * uses, with its org scoping, its allow-list and its audit trail intact.
   *
   * A CLAIM THAT FILED IS A CLAIM THAT EXISTS. If the receipt upload fails the
   * claim still stands, and reporting only the failure would have the employee
   * re-submit and create a duplicate — so both halves are reported.
   */
  const submit = useMutation({
    mutationFn: async (values: ClaimForm) => {
      const created = await myExpensesService.create({
        category_uuid: values.category_uuid,
        amount: Number(values.amount),
        expense_date: values.expense_date,
        description: values.description.trim() || undefined,
        payment_mode: values.payment_mode,
        auto_approve: autoApprove || undefined,
      });

      if (receipt) {
        try {
          await myExpensesService.uploadReceipts(created.uuid, [receipt]);
          return { claim: created, receiptAttached: true };
        } catch {
          return { claim: created, receiptAttached: false };
        }
      }
      return { claim: created, receiptAttached: null };
    },
    onSuccess: (result) => {
      onFiled();
      onOpenChange(false);
      /*
       * A REFUSED AUTO-APPROVAL IS NOT A FAILED SUBMISSION. The claim is filed
       * and pending; saying otherwise would have the employee try again and file
       * a second claim. The reason is surfaced as the warning it is.
       */
      if (result.claim.auto_approve_refusal) {
        toast.warning(result.claim.auto_approve_refusal);
      } else if (result.receiptAttached === false) {
        toast.warning(
          `${t("myExpenses.filedToast")} ${t("myExpenses.receiptAttachFailed")}`,
        );
      } else {
        toast.success(t("myExpenses.filedToast"));
      }
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

      {/*
       * THE EMPTY CATEGORY LIST.
       *
       * A dropdown showing only its placeholder is indistinguishable from one
       * that is still loading, and an employee with no categories cannot file
       * anything and has no way to find out why. This states the problem, and
       * offers the shortcut to the page that fixes it — but only to someone the
       * backend would actually let create one, because offering a control that
       * answers 403 is worse than not offering it.
       */}
      {categoriesFailed ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-xs text-destructive">
            {t("expenses.categoriesLoadFailed")}
          </p>
          <button
            type="button"
            onClick={() => void categories.refetch()}
            className="mt-1 text-xs font-medium text-primary underline underline-offset-2"
          >
            {t("expenses.retryLoadCategories")}
          </button>
        </div>
      ) : null}

      {categoriesEmpty ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <p className="text-xs text-amber-700 dark:text-amber-500">
            {t("expenses.noCategoriesFound")}
          </p>
          {canManageCategories ? (
            <Link
              to="/org/expense-claims"
              search={{ manageCategories: true }}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
              onClick={() => onOpenChange(false)}
            >
              <FolderTree className="h-3.5 w-3.5" aria-hidden="true" />
              {t("expenses.createCategoryShortcut")}
            </Link>
          ) : null}
        </div>
      ) : null}

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

      {/*
       * THE RECEIPT, AT SUBMISSION.
       *
       * This used to be a note saying "attach it afterwards from the claim's
       * detail", which meant the one thing that decides whether a
       * receipt-required claim gets approved was deferred to a second visit the
       * employee had no reason to make. The employee is the only person holding
       * the till slip, so the slip belongs in the same breath as the amount.
       *
       * The advisory-note the dropzone replaces still exists further down for the
       * claims that do NOT require one, where attaching a receipt is optional.
       */}
      {selected?.requires_receipt ? (
        <FileDropzone
          value={receipt ? [receipt] : []}
          onChange={(files) => setReceipt(files[0] ?? null)}
          accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
          maxFiles={1}
          maxSizeMb={10}
          disabled={submit.isPending}
          label={t("expenses.receiptLabel", "Receipt")}
          hint={t("expenses.receiptHint", "PDF or image, up to 10MB")}
        />
      ) : (
        <FileDropzone
          value={receipt ? [receipt] : []}
          onChange={(files) => setReceipt(files[0] ?? null)}
          accept=".pdf,.jpg,.jpeg,.png,image/*,application/pdf"
          maxFiles={1}
          maxSizeMb={10}
          disabled={submit.isPending}
          label={t("expenses.receiptOptionalLabel", "Receipt (optional)")}
          hint={t("expenses.receiptHint", "PDF or image, up to 10MB")}
        />
      )}

      {/*
       * AUTO-APPROVAL, last because it is the least important decision.
       *
       * Offered only to a role the server agrees can approve claims, and hidden
       * entirely from everyone else — the server re-checks the permission from
       * the session regardless, so this controlling visibility is all the
       * checkbox is for. An employee who never sees it gets a pending claim, and
       * an account that posts the flag by hand gets the same thing.
       */}
      {canManageCategories ? (
        <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
          <input
            type="checkbox"
            checked={autoApprove}
            onChange={(e) => setAutoApprove(e.target.checked)}
            disabled={submit.isPending}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">{t("expenses.autoApproveLabel", "Auto-approve this claim upon submission")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("expenses.autoApproveHint", "Skips the approval queue. The approver, time and the fact that review was skipped are all recorded.")}
            </span>
            {/*
             * STATED WHERE IT APPLIES, not buried in a policy document. A person
             * approving a claim that reimburses them is the self-approval the
             * module refuses, and the shortcut does not become a way around it.
             */}
            <span className="block text-xs text-muted-foreground">
              {t("expenses.autoApproveSelfExcluded", "Not available for a claim that reimburses yourself.")}
            </span>
          </span>
        </label>
      ) : null}
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
            {/* Status + Payment Mode Banner */}
            <div
              className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 ${
                claim.status === "paid"
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : claim.status === "approved"
                    ? "border-blue-500/30 bg-blue-500/10"
                    : claim.status === "rejected"
                      ? "border-destructive/30 bg-destructive/10"
                      : "border-amber-500/30 bg-amber-500/10"
              }`}
            >
              <Badge variant={CLAIM_STATUS_VARIANT[claim.status]} className="text-xs px-2.5 py-0.5">
                {t(STATUS_LABEL[claim.status])}
              </Badge>
              <Badge variant={claim.payment_mode === "payroll" ? "secondary" : "outline"} className="text-xs">
                {t(`expenses.mode.${claim.payment_mode}`)}
              </Badge>
              {!claim.receipt_satisfied ? (
                <span className="ml-auto text-xs font-medium text-amber-600 dark:text-amber-400">
                  ⚠ {t("expenses.receiptMissing")}
                </span>
              ) : null}
            </div>

            {/* Key Details Grid */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("expenses.expenseDate")} &amp; Details
              </h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("expenses.expenseDate")}</dt>
                  <dd className="font-medium text-foreground">{formatDate(claim.expense_date)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("expenses.paymentMode")}</dt>
                  <dd className="font-medium text-foreground">{t(`expenses.mode.${claim.payment_mode}`)}</dd>
                </div>
                {claim.category_requires_receipt !== undefined ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("expenses.receipts")}</dt>
                    <dd className="font-medium text-foreground">
                      {claim.category_requires_receipt
                        ? t("expenses.receiptRequired")
                        : t("expenses.receiptOptional", "Optional")}
                    </dd>
                  </div>
                ) : null}
                {claim.paid_at ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("expenses.paidAt", { date: "" }).replace("", "").trim() || "Paid on"}</dt>
                    <dd className="font-medium text-emerald-700 dark:text-emerald-400">{formatDate(claim.paid_at)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            {/* Description */}
            {claim.description ? (
              <div className="rounded-xl border bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap">
                {claim.description}
              </div>
            ) : null}

            {/* Rejection reason */}
            {claim.rejection_reason ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive mb-1">
                  {t("expenses.rejectionReason")}
                </p>
                <p className="whitespace-pre-wrap text-sm">{claim.rejection_reason}</p>
                <p className="mt-2 text-xs text-muted-foreground">{t("expenses.resubmitHint")}</p>
              </div>
            ) : null}

            {/* Paid notice */}
            {claim.paid_at ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                ✓ {t("expenses.paidAt", { date: formatDate(claim.paid_at) })}
              </div>
            ) : null}

            {/* Receipts Section */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {t("expenses.receipts")}
                  {claim.category_requires_receipt ? (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      ({t("expenses.receiptRequired")})
                    </span>
                  ) : null}
                </p>
                {receipts.length > 0 ? (
                  <span className="text-xs text-muted-foreground">{receipts.length} file{receipts.length !== 1 ? "s" : ""}</span>
                ) : null}
              </div>

              {receipts.length > 0 ? (
                <div className="space-y-2">
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
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("expenses.noReceipts")}</p>
              )}

              {claim.status !== "rejected" ? (
                <div className="space-y-2 border-t border-border/50 pt-3">
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
