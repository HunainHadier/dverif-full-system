import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Eye, FolderTree, Pencil, Plus, Receipt, Trash2, Undo2, Upload, Wallet, X } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { FormDialog } from "@/components/hr/FormDialog";
import { FileDropzone } from "@/components/hr/FileDropzone";
import { AttachmentCard, type AttachmentCardHandlers } from "@/components/hr/AttachmentCard";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CLAIM_STATUS_VARIANT,
  expenseCategoriesService,
  expenseClaimsService,
  type ClaimStatus,
  type ExpenseAttachment,
  type ExpenseCategory,
  type ExpenseClaim,
  type PaymentMode,
} from "@/services";
import { apiErrorMessage, formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/expense-claims")({
  head: () => ({ meta: [{ title: "Expense Claims — Dverif" }] }),
  component: ExpenseClaimsPage,
});

const PAGE_SIZE = 20;

/**
 * Status -> label key, as a lookup rather than a template.
 *
 * `t(`expenses.status.${r.status}`)` would be shorter and the audit script cannot
 * see a computed key at all, so it would report all four as unreferenced and
 * nobody would notice if one went missing from en.json. Naming them here makes the
 * audit find them. The four `expenses.status.*` keys are listed under
 * DYNAMIC_KEY_PREFIXES in scripts/audit_i18n_keys.mjs, exactly as hr.approval.*
 * already is.
 */
const STATUS_LABEL: Record<ClaimStatus, string> = {
  pending: "expenses.status.pending",
  approved: "expenses.status.approved",
  rejected: "expenses.status.rejected",
  paid: "expenses.status.paid",
};

/**
 * Expense claims: the finance review queue.
 *
 * THE ONLY THING THIS PAGE MAY NOT DO is decide what a claim is worth. Every
 * amount shown here is the employee's own figure as filed — there is no "adjust"
 * control, because an approval screen with an editable amount is how a company
 * ends up reimbursing a number nobody claimed. If an amount is wrong the honest
 * route is Reject with a reason and a corrected resubmission.
 *
 * APPROVAL IS NOT PAYMENT. Approving a claim leaves it `approved`, and an
 * approved payroll-mode claim is settled later, by a payroll run, as an
 * `auto_expense` earning line on that employee's payslip. So "Approved" on this
 * page means "approved for reimbursement", NOT "money moved", and the Payout
 * column is what distinguishes the two. Conflating them would make this queue
 * look like it had already paid everyone on it.
 *
 * ONLY DIRECT-MODE CLAIMS CAN BE SETTLED BY HAND, which is the server's rule
 * (markClaimPaid refuses a payroll-mode claim). The Mark paid action is therefore
 * hidden on every row the payroll owns: a menu item whose only possible outcome
 * is a 409 teaches people the page is broken.
 *
 * THERE IS NO "NEW CLAIM" BUTTON, AND THAT IS THE POLICY. An org_admin reaches
 * this page through a gate that makes them unconditionally `approve_expenses`, so
 * a create control here would hand the one account that can rubber-stamp every
 * reimbursement the power to originate one - approving its own. Staff shape the
 * policy (categories) and adjudicate it (review); they do not spend the company's
 * money by filing against an employee of their choosing. Employees file from
 * /my-expenses, where the server derives the claimant from the session.
 */
function ExpenseClaimsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState("claims");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ClaimStatus | "">("");
  const [category, setCategory] = useState("");
  const [detailUuid, setDetailUuid] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<ExpenseClaim | null>(null);
  const [paying, setPaying] = useState<ExpenseClaim | null>(null);
  const [showInactiveCategories, setShowInactiveCategories] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<ExpenseCategory | null>(null);

  const list = useQuery({
    queryKey: ["expense-claims", page, status, category],
    queryFn: () =>
      expenseClaimsService.list({
        page,
        limit: PAGE_SIZE,
        status: status || undefined,
        category_uuid: category || undefined,
      }),
  });

  const categories = useQuery({
    queryKey: ["expense-categories", showInactiveCategories],
    queryFn: () => expenseCategoriesService.list(showInactiveCategories),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["expense-claims"] });
    void qc.invalidateQueries({ queryKey: ["expense-categories"] });
    void qc.invalidateQueries({ queryKey: ["my-expense-categories"] });
  };

  const removeCategory = useMutation({
    mutationFn: (row: ExpenseCategory) => expenseCategoriesService.remove(row.uuid),
    onSuccess: (res) => {
      invalidate();
      setDeletingCategory(null);
      toast.success(
        res.claims_preserved > 0
          ? t("expenses.categoryRemovedWithClaims", { count: res.claims_preserved })
          : t("expenses.categoryRemoved"),
      );
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("expenses.categoryDeleteFailed"))),
  });

  const restoreCategory = useMutation({
    mutationFn: (row: ExpenseCategory) => expenseCategoriesService.restore(row.uuid),
    onSuccess: () => {
      invalidate();
      toast.success(t("expenses.categoryRestored"));
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("expenses.categoryUpdateFailed"))),
  });

  /**
   * Settle a direct claim by hand.
   *
   * No payment reference is asked for: the transfer is made outside the system, so
   * anything typed here would be a note-to-self that reads like a bank reference.
   * The claim's own status is the record that it was settled.
   */
  const pay = useMutation({
    mutationFn: (row: ExpenseClaim) => expenseClaimsService.pay(row.uuid),
    onSuccess: () => {
      invalidate();
      setPaying(null);
      toast.success(t("expenses.paidToast"));
    },
  });

  const rows = list.data?.items ?? [];

  /**
   * Every filter resets to page 1.
   *
   * Narrowing a filter while sitting on page 4 renders an empty table, which reads
   * as "nothing matches" rather than "there is no page 4 of this".
   */
  const setStatusFilter = (v: ClaimStatus | "") => {
    setStatus(v);
    setPage(1);
  };
  const setCategoryFilter = (v: string) => {
    setCategory(v);
    setPage(1);
  };

  const columns: DataTableColumn<ExpenseClaim>[] = [
    {
      key: "employee_name",
      header: t("expenses.employee"),
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.employee_name}</p>
          <p className="truncate text-xs text-muted-foreground">{r.category_name ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "expense_date",
      header: t("expenses.expenseDate"),
      // JUST THE DATE. This column used to carry the description underneath it,
      // which is where it went wrong: `truncate` needs a bounded parent to clip
      // against, and a table cell is sized by its content, so a long description
      // widened the column instead of being cut off. A reviewer scanning the queue
      // for "the taxi claims from last week" got a wall of prose where a date
      // should be, and the queue's own sort order was unreadable at a glance.
      //
      // The description is not lost — it is the first thing the detail sheet shows,
      // which is where it is actually read rather than skimmed.
      render: (r) => (
        // The day the money was spent, which is what the payroll period is
        // bucketed by. It is deliberately NOT the created_at date, because a claim
        // filed in March for a February taxi belongs in February.
        <span className="whitespace-nowrap text-sm">{formatDate(r.expense_date)}</span>
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
          {/*
              The receipt warning rides next to the status rather than replacing it:
              a claim that cannot be approved is still pending, and showing only
              "needs receipt" would hide that it is waiting on the employee rather
              than on finance.
          */}
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
       * Payout, as a column SEPARATE from status.
       *
       * This is the distinction the page would otherwise get wrong. An approved
       * payroll-mode claim has not been paid — the money is owed and goes out with
       * the next payroll run for that month. Showing "Approved" in a column headed
       * Payout would tell finance the employee already has the money.
       */
      key: "payout",
      header: t("expenses.payout"),
      render: (r) => {
        if (r.status === "paid") {
          return (
            <span className="text-xs text-muted-foreground">
              {r.paid_via_salary_record_uuid
                ? t("expenses.paidViaPayroll")
                : t("expenses.paidDirect", { reference: r.payment_reference ?? "—" })}
            </span>
          );
        }
        if (r.status === "approved") {
          return (
            <span className="text-xs text-muted-foreground">
              {r.payment_mode === "payroll"
                ? t("expenses.awaitingPayroll")
                : t("expenses.awaitingTransfer")}
            </span>
          );
        }
        if (r.status === "pending") return <span className="text-xs text-muted-foreground">—</span>;
        return <span className="text-xs text-muted-foreground">{t("expenses.notPayable")}</span>;
      },
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            title={t("expenses.viewDetails")}
            onClick={() => setDetailUuid(r.uuid)}
          >
            <Eye className="h-4 w-4" />
          </Button>

          {r.status === "pending" ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                title={
                  // A disabled button cannot be clicked to find out why, and
                  // nothing else on the row explains it. The title carries the
                  // reason.
                  r.receipt_satisfied ? t("expenses.approve") : t("expenses.approveNeedsReceipt")
                }
                disabled={!r.receipt_satisfied}
                onClick={() => setReviewing(r)}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={t("expenses.reject")}
                onClick={() => setReviewing(r)}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : null}

          {/* Direct-only, because the server refuses to hand-pay a payroll-mode
              claim: paying it here AND letting the next payroll run consume it is
              exactly the double payment the module exists to prevent. */}
          {r.status === "approved" && r.payment_mode === "direct" ? (
            <Button
              variant="ghost"
              size="icon"
              title={t("expenses.markPaid")}
              onClick={() => setPaying(r)}
            >
              <Wallet className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const pendingCount = useMemo(
    () => (list.data?.items ?? []).filter((r) => r.status === "pending").length,
    [list.data],
  );

  const categoryColumns: DataTableColumn<ExpenseCategory>[] = [
    {
      key: "name",
      header: t("expenses.categoryName"),
      render: (r) => {
        const active = Boolean(Number(r.is_active));
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{r.name}</span>
              {!active ? (
                <Badge variant="secondary" className="text-xs">
                  {t("expenses.categoryRemovedBadge")}
                </Badge>
              ) : null}
            </div>
            {r.description ? (
              <p className="text-xs text-muted-foreground truncate max-w-md">{r.description}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "max_limit_per_claim",
      header: t("expenses.categoryLimitLabel"),
      render: (r) => (
        <span className="font-mono text-xs">
          {r.max_limit_per_claim === null
            ? t("expenses.noLimit")
            : formatCurrency(Number(r.max_limit_per_claim))}
        </span>
      ),
    },
    {
      key: "requires_receipt",
      header: t("expenses.requiresReceipt"),
      render: (r) => (
        <Badge variant={r.requires_receipt ? "outline" : "secondary"} className="text-xs">
          {r.requires_receipt ? t("expenses.requiresReceipt") : t("expenses.receiptNotRequired")}
        </Badge>
      ),
    },
    {
      key: "is_active",
      header: t("common.status"),
      render: (r) => {
        const active = Boolean(Number(r.is_active));
        return (
          <Badge variant={active ? "default" : "secondary"} className="text-xs">
            {active ? t("common.active") : t("expenses.categoryRemovedBadge")}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (r) => {
        const active = Boolean(Number(r.is_active));
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setEditingCategory(r);
                setCategoryDialogOpen(true);
              }}
              title={t("expenses.editCategory")}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {active ? (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setDeletingCategory(r)}
                title={t("expenses.deleteCategory")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                disabled={restoreCategory.isPending}
                onClick={() => restoreCategory.mutate(r)}
                title={t("expenses.restoreCategory")}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <ModuleGate module="expense_management">
      <div className="space-y-4">
        <PageHeader
          title={t("expenses.title")}
          description={t("expenses.description")}
          actions={
            <Button
              onClick={() => {
                setEditingCategory(null);
                setCategoryDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("expenses.newCategory")}
            </Button>
          }
        />

        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="claims">
              <Receipt className="mr-2 h-4 w-4" />
              {t("expenses.title")}
              {pendingCount > 0 ? (
                <Badge variant="outline" className="ml-2 text-xs">
                  {pendingCount}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="categories">
              <FolderTree className="mr-2 h-4 w-4" />
              {t("expenses.manageCategories")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="claims" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {CLAIM_STATUS_KEYS.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={status === s ? "default" : "outline"}
                  onClick={() => setStatusFilter(status === s ? "" : s)}
                >
                  {t(STATUS_LABEL[s])}
                </Button>
              ))}
              <select
                value={category}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                aria-label={t("expenses.category")}
              >
                <option value="">{t("expenses.allCategories")}</option>
                {(categories.data ?? []).map((c) => (
                  <option key={c.uuid} value={c.uuid}>
                    {c.name}
                  </option>
                ))}
              </select>
              {pendingCount > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {t("expenses.pendingOnPage", { count: pendingCount })}
                </span>
              ) : null}
            </div>

            <DataTable
              columns={columns}
              rows={rows}
              loading={list.isLoading}
              total={list.data?.total}
              page={list.data?.page}
              onPageChange={setPage}
              emptyIcon={Receipt}
              emptyTitle={t("expenses.empty")}
              emptyDescription={t("expenses.emptyDescription")}
            />
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showInactiveCategories}
                  onChange={(e) => setShowInactiveCategories(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <span>{t("expenses.showRemovedCategories")}</span>
              </label>

              <Button
                size="sm"
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryDialogOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {t("expenses.newCategory")}
              </Button>
            </div>

            <DataTable
              columns={categoryColumns}
              rows={categories.data ?? []}
              loading={categories.isLoading}
              emptyIcon={FolderTree}
              emptyTitle={t("expenses.noCategories")}
              emptyDescription={t("expenses.manageCategoriesDescription")}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ClaimDetailSheet
        uuid={detailUuid}
        onOpenChange={(v) => !v && setDetailUuid(null)}
        onChanged={invalidate}
      />

      <ReviewDialog
        claim={reviewing}
        onOpenChange={(v) => !v && setReviewing(null)}
        onDone={invalidate}
      />

      <ConfirmDialog
        open={Boolean(paying)}
        title={t("expenses.markPaid")}
        description={
          paying
            ? t("expenses.markPaidWarning", {
                name: paying.employee_name,
                amount: formatCurrency(paying.amount),
              })
            : ""
        }
        confirmLabel={t("expenses.markPaid")}
        loading={pay.isPending}
        error={pay.isError ? apiErrorMessage(pay.error, t("expenses.actionFailed")) : null}
        onConfirm={() => pay.mutateAsync(paying!)}
        onOpenChange={(v) => !v && setPaying(null)}
      />

      <CategoryDialog
        key={categoryDialogOpen ? (editingCategory?.uuid ?? "new") : "closed"}
        open={categoryDialogOpen}
        onOpenChange={(v) => {
          setCategoryDialogOpen(v);
          if (!v) setEditingCategory(null);
        }}
        category={editingCategory}
      />

      <ConfirmDialog
        open={Boolean(deletingCategory)}
        title={t("expenses.deleteCategory")}
        description={
          deletingCategory
            ? t("expenses.deleteCategoryWarning", { name: deletingCategory.name })
            : ""
        }
        confirmLabel={t("expenses.deleteCategory")}
        loading={removeCategory.isPending}
        error={removeCategory.isError ? apiErrorMessage(removeCategory.error, t("expenses.categoryDeleteFailed")) : null}
        onConfirm={() => deletingCategory && removeCategory.mutateAsync(deletingCategory)}
        onOpenChange={(v) => !v && setDeletingCategory(null)}
      />
    </ModuleGate>
  );
}

const CLAIM_STATUS_KEYS: ClaimStatus[] = ["pending", "approved", "paid", "rejected"];

// ---------------------------------------------------------------------------
// Detail sheet: the receipts, and an upload for the ones that need one
// ---------------------------------------------------------------------------

const EXPENSE_ATTACHMENT_HANDLERS: AttachmentCardHandlers = {
  download: (uuid) => expenseClaimsService.downloadAttachment(uuid),
  remove: (uuid) => expenseClaimsService.removeAttachment(uuid),
};

function ClaimDetailSheet({
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
    queryKey: ["expense-claim", uuid],
    queryFn: () => expenseClaimsService.get(uuid!),
    enabled: open,
  });

  // Clear the staged files when the sheet changes subject, or a receipt picked for
  // one claim is silently uploaded against the next one opened.
  useEffect(() => {
    if (!open) setFiles([]);
  }, [open, uuid]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!uuid) return;
      await expenseClaimsService.uploadReceipts(uuid, files);
    },
    onSuccess: () => {
      setFiles([]);
      onChanged();
      void qc.invalidateQueries({ queryKey: ["expense-claim", uuid] });
      toast.success(t("expenses.receiptsUploaded"));
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("expenses.uploadFailed"))),
  });

  const claim = detail.data;
  const receipts: ExpenseAttachment[] = claim?.receipts ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {claim ? `${claim.employee_name} · ${formatCurrency(claim.amount)}` : t("loading")}
          </SheetTitle>
          <SheetDescription>
            {claim
              ? `${claim.category_name ?? "—"} · ${formatDate(claim.expense_date)}`
              : t("loading")}
          </SheetDescription>
        </SheetHeader>

        {claim ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">{t("common.status")}</dt>
                <dd>
                  <Badge variant={CLAIM_STATUS_VARIANT[claim.status]}>
                    {t(STATUS_LABEL[claim.status])}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("expenses.paymentMode")}</dt>
                <dd>{t(`expenses.mode.${claim.payment_mode}`)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("expenses.expenseDate")}</dt>
                <dd>{formatDate(claim.expense_date)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("expenses.filedOn")}</dt>
                <dd>{formatDateTime(claim.created_at)}</dd>
              </div>
            </dl>

            {claim.description ? (
              <div>
                <p className="text-xs text-muted-foreground">{t("expenses.descriptionLabel")}</p>
                {/* whitespace-pre-wrap because an employee's note is a paragraph,
                    and a collapsed newline makes two separate sentences read as one
                    run-on. */}
                <p className="whitespace-pre-wrap text-sm">{claim.description}</p>
              </div>
            ) : null}

            {claim.rejection_reason ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive">
                  {t("expenses.rejectionReason")}
                </p>
                <p className="whitespace-pre-wrap text-sm">{claim.rejection_reason}</p>
              </div>
            ) : null}

            {claim.paid_at ? (
              <div className="rounded-md bg-muted/50 p-3 text-xs">
                <p>{t("expenses.paidAt", { date: formatDateTime(claim.paid_at) })}</p>
                {claim.paid_via_salary_record_uuid ? (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {t("expenses.salaryRecord")}: {claim.paid_via_salary_record_uuid}
                  </p>
                ) : null}
                {claim.payment_reference ? (
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {t("expenses.reference")}: {claim.payment_reference}
                  </p>
                ) : null}
              </div>
            ) : null}

            {claim.category_max_limit ? (
              <p className="text-xs text-muted-foreground">
                {t("expenses.categoryLimit", { amount: formatCurrency(claim.category_max_limit) })}
              </p>
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
                    void qc.invalidateQueries({ queryKey: ["expense-claim", uuid] });
                  }}
                />
              ))}

              {receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("expenses.noReceipts")}</p>
              ) : null}

              {/* Uploading on a rejected claim is refused by the server
                  (attachReceipts throws), so the control is hidden rather than
                  offered-then-409. */}
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
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Review dialog: approve or reject, and the payout route it will take
// ---------------------------------------------------------------------------

type ReviewForm = {
  decision: "approved" | "rejected";
  rejection_reason: string;
  payment_mode: PaymentMode;
};

function ReviewDialog({
  claim,
  onOpenChange,
  onDone,
}: {
  claim: ExpenseClaim | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const open = Boolean(claim);

  const form = useForm<ReviewForm>({
    defaultValues: { decision: "approved", rejection_reason: "", payment_mode: "payroll" },
  });
  const { reset, watch, setValue } = form;

  // Reset on the closed -> open transition, seeded from the claim. Without it,
  // opening this for a second claim keeps the first claim's rejection reason and
  // payment mode — and a rejection saved with the wrong reason is a decision
  // nobody can audit.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      reset({
        decision: "approved",
        rejection_reason: "",
        payment_mode: claim?.payment_mode ?? "payroll",
      });
    }
    wasOpen.current = open;
  }, [open, claim, reset]);

  const decision = watch("decision");

  const review = useMutation({
    mutationFn: async (values: ReviewForm) => {
      if (!claim) return;
      if (values.decision === "approved") {
        return expenseClaimsService.review(claim.uuid, {
          decision: "approved",
          payment_mode: values.payment_mode,
        });
      }
      return expenseClaimsService.review(claim.uuid, {
        decision: "rejected",
        rejection_reason: values.rejection_reason.trim(),
        payment_mode: values.payment_mode,
      });
    },
    onSuccess: () => {
      onDone();
      onOpenChange(false);
      toast.success(t("expenses.reviewSaved"));
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("expenses.reviewFailed"))),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={claim ? t("expenses.reviewTitle") : ""}
      description={claim ? `${claim.employee_name} · ${formatCurrency(claim.amount)}` : ""}
      submitLabel={decision === "approved" ? t("expenses.approve") : t("expenses.reject")}
      cancelLabel={t("common.cancel")}
      onSubmit={(values) => review.mutateAsync(values)}
      form={form}
    >
      <div className="flex gap-2">
        {(["approved", "rejected"] as const).map((d) => (
          <Button
            key={d}
            type="button"
            variant={decision === d ? "default" : "outline"}
            size="sm"
            onClick={() => setValue("decision", d)}
          >
            {d === "approved" ? t("expenses.approve") : t("expenses.reject")}
          </Button>
        ))}
      </div>

      {/* The payout route is a decision, not a detail: choosing payroll hands the
          claim to the next run for the month the expense was spent, and choosing
          direct leaves it for a manual transfer. Stated in words under the control
          rather than left as two words to guess. */}
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("expenses.paymentMode")}</span>
        <select
          {...form.register("payment_mode")}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          <option value="payroll">{t("expenses.mode.payroll")}</option>
          <option value="direct">{t("expenses.mode.direct")}</option>
        </select>
        <span className="block text-xs text-muted-foreground">
          {form.watch("payment_mode") === "payroll"
            ? t("expenses.modePayrollHint")
            : t("expenses.modeDirectHint")}
        </span>
      </label>

      {decision === "rejected" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("expenses.rejectionReasonLabel")}</span>
          <textarea
            {...form.register("rejection_reason", {
              required: t("expenses.rejectionReasonRequired"),
            })}
            rows={3}
            placeholder={t("expenses.rejectionReasonPlaceholder")}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
          {/* An unexplained rejection is not actionable: the employee then has to
              ask HR what was wrong instead of being told. Required by the server,
              and required here so it is not discovered after a round trip. */}
          <span className="block text-xs text-muted-foreground">
            {t("expenses.rejectionReasonHint")}
          </span>
        </label>
      ) : null}
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------
// Category dialog: what may be claimed, up to how much, with what proof
// ---------------------------------------------------------------------------

type CategoryForm = {
  name: string;
  description: string;
  max_limit_per_claim: string;
  requires_receipt: boolean;
};

function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Present = edit this one. Absent = create a new one. */
  category?: ExpenseCategory | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const editing = category ?? null;
  const form = useForm<CategoryForm>({
    defaultValues: { name: "", description: "", max_limit_per_claim: "", requires_receipt: true },
  });
  const { reset } = form;

  /**
   * Prefill on the closed -> open transition.
   *
   * Keyed on the category uuid as well as the flag, so going from editing A to
   * editing B — which leaves the dialog mounted the whole time — cannot keep A's
   * values. Saving a limit of 50,000 onto the wrong category because the form was
   * never re-read is the kind of mistake a reviewer approves for months.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      reset({
        name: editing?.name ?? "",
        description: editing?.description ?? "",
        // The column is DECIMAL and arrives as a string; Number('') is 0, which the
        // form would then render as a real zero limit rather than "no limit".
        max_limit_per_claim:
          editing?.max_limit_per_claim === null || editing?.max_limit_per_claim === undefined
            ? ""
            : String(editing.max_limit_per_claim),
        requires_receipt: editing ? Boolean(editing.requires_receipt) : true,
      });
    }
    wasOpen.current = open;
  }, [open, editing, reset]);

  const save = useMutation({
    mutationFn: (values: CategoryForm) => {
      // Empty string means NO limit, which the server stores as NULL. Sending 0
      // instead would be refused — and rightly, because a zero ceiling reads as
      // "nothing may be claimed" when it almost certainly means "no cap".
      const payload = {
        name: values.name.trim(),
        description: values.description.trim() || null,
        max_limit_per_claim: values.max_limit_per_claim ? Number(values.max_limit_per_claim) : null,
        requires_receipt: values.requires_receipt,
      };
      return editing
        ? expenseCategoriesService.update(editing.uuid, payload)
        : expenseCategoriesService.create(payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["expense-categories"] });
      void qc.invalidateQueries({ queryKey: ["my-expense-categories"] });
      reset();
      onOpenChange(false);
      toast.success(t(editing ? "expenses.categoryUpdated" : "expenses.categoryCreated"));
    },
    onError: (e) =>
      toast.error(
        apiErrorMessage(e, t(editing ? "expenses.categoryUpdateFailed" : "expenses.categoryCreateFailed")),
      ),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
      title={t(editing ? "expenses.editCategory" : "expenses.newCategory")}
      description={
        t(editing ? "expenses.editCategoryDescription" : "expenses.newCategoryDescription")
      }
      submitLabel={t("common.save")}
      cancelLabel={t("common.cancel")}
      onSubmit={(values) => save.mutateAsync(values)}
      form={form}
    >
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("expenses.categoryName")}</span>
        <input
          {...form.register("name", { required: t("expenses.categoryName") })}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("expenses.categoryDescriptionLabel")}</span>
        <input
          {...form.register("description")}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("expenses.categoryLimitLabel")}</span>
        <input
          {...form.register("max_limit_per_claim")}
          inputMode="decimal"
          placeholder={t("expenses.noLimit")}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        />
        <span className="block text-xs text-muted-foreground">
          {t("expenses.categoryLimitHint")}
        </span>
        {/* Stated here because the consequence is not visible from the field: the
            limit is re-checked at APPROVAL, so lowering it below a claim that is
            already filed leaves that claim unapprovable and failing the same check
            the reviewer sees. Better said before the save than discovered after. */}
        {editing ? (
          <span className="block text-xs text-amber-700 dark:text-amber-500">
            {t("expenses.categoryLimitEditWarning")}
          </span>
        ) : null}
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...form.register("requires_receipt")} className="h-4 w-4" />
        <span>
          {t("expenses.requiresReceipt")}
          <span className="block text-xs text-muted-foreground">
            {t("expenses.requiresReceiptHint")}
          </span>
        </span>
      </label>
    </FormDialog>
  );
}