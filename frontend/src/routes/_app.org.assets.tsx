import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Ban,
  Download,
  FileText,
  MoreHorizontal,
  Package,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Wrench,
} from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { FormDialog } from "@/components/hr/FormDialog";
import { FileDropzone } from "@/components/hr/FileDropzone";
import { AttachmentCard } from "@/components/hr/AttachmentCard";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { SearchableSelect, type SearchableSelectItem } from "@/components/common/SearchableSelect";
import {
  ASSET_STATUS_VARIANT,
  assetsService,
  assetCategoriesService,
  isCurrentEmployee,
  orgService,
  type Asset,
  type AssetAttachment,
  type AssetDetail,
  type AssetStatus,
} from "@/services";
import {
  apiErrorMessage,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatFileSize,
} from "@/lib/utils";

export const Route = createFileRoute("/_app/org/assets")({
  head: () => ({ meta: [{ title: "Assets — Dverif" }] }),
  component: AssetsPage,
});

const PAGE_SIZE = 20;

/**
 * Asset inventory.
 *
 * STATUS IS NEVER SENT FROM HERE. There is no status field on any create or
 * update payload: the server derives it from the open assignment and maintenance
 * rows, so offering one would produce a control whose value is silently ignored.
 * The menu only offers the transitions the server actually implements.
 *
 * The action menu is driven by the SAME status map the backend enforces, because
 * a menu that offers an action the server will refuse is worse than one that
 * omits it — it teaches users that the page is unreliable.
 */
function AssetsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AssetStatus | "">("");
  const [category, setCategory] = useState("");
  const [detailUuid, setDetailUuid] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    null | "create" | "edit" | "assign" | "return" | "maintenance" | "retire"
  >(null);
  const [active, setActive] = useState<Asset | null>(null);

  const list = useQuery({
    queryKey: ["assets", page, search, status, category],
    queryFn: () =>
      assetsService.list({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: status || undefined,
        category_uuid: category || undefined,
      }),
  });

  const categories = useQuery({
    queryKey: ["asset-categories", false],
    queryFn: () => assetCategoriesService.list(false),
  });

  const summary = useQuery({
    queryKey: ["assets-summary"],
    queryFn: () => assetsService.summary(),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["assets"] });
    void qc.invalidateQueries({ queryKey: ["assets-summary"] });
  };

  const rows = list.data?.items ?? [];

  const columns: DataTableColumn<Asset>[] = [
    {
      key: "asset_tag",
      header: t("assets.tag"),
      render: (r) => <span className="font-mono text-xs">{r.asset_tag}</span>,
    },
    {
      key: "name",
      header: t("assets.assetName"),
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name}</p>
          {r.model_details ? (
            <p className="truncate text-xs text-muted-foreground">{r.model_details}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "category_name",
      header: t("assets.category"),
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.category_name ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: t("common.status"),
      render: (r) => (
        // open_jobs is the server's count of unfinished repair jobs, and it is
        // only meaningful next to the status it explains: a badge that says
        // "Maintenance" for two separate faults is one problem on a dashboard and
        // two problems on a worklist, and the count is what stops the asset being
        // closed out after the first repair.
        <span className="flex items-center gap-1.5">
          <Badge variant={ASSET_STATUS_VARIANT[r.status]}>{t(`assets.status.${r.status}`)}</Badge>
          {(r.open_jobs ?? 0) > 0 ? (
            <span className="text-xs text-muted-foreground">
              {t("assets.openJobs", { count: r.open_jobs ?? 0 })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      // Answers "who has this" without opening the drawer, which is the single
      // most-asked question about an inventory and the reason the list query
      // joins the open assignment server-side.
      key: "holder_name",
      header: t("assets.heldBy"),
      render: (r) =>
        r.holder_name ? (
          <span className="text-sm">{r.holder_name}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "purchase_cost",
      header: t("assets.cost"),
      render: (r) => <span className="font-mono text-xs">{formatCurrency(r.purchase_cost)}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <RowActions
          row={r}
          onOpenDetails={() => setDetailUuid(r.uuid)}
          onDialog={(kind) => {
            setActive(r);
            setDialog(kind);
          }}
        />
      ),
    },
  ];

  const s = summary.data?.by_status;
  const money = summary.data;

  return (
    <ModuleGate module="asset_management">
      <div className="space-y-4">
        <PageHeader
          title={t("assets.title")}
          description={t("assets.description")}
          actions={
            <Button
              onClick={() => {
                setActive(null);
                setDialog("create");
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("assets.newAsset")}
            </Button>
          }
        />

        {/* Counts, because "12 assigned" is the number an administrator is
            actually asked for and it should not require a filter click.

            total_value and maintenance_spend are the server's figures, not a
            client-side sum of the page: the register is paginated, so summing the
            rows on screen would silently report only the first page's worth.
            maintenance_spend also only counts COMPLETED jobs, which is the money
            actually spent - an open job has a cost attached but has not been paid,
            and showing it as spend makes the number move before anything is paid. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label={t("assets.status.available")} value={s?.available ?? 0} />
          <Stat label={t("assets.status.assigned")} value={s?.assigned ?? 0} />
          <Stat label={t("assets.status.maintenance")} value={s?.maintenance ?? 0} />
          <Stat label={t("assets.status.retired")} value={s?.retired ?? 0} />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <MoneyStat
            label={t("assets.totalValue")}
            value={money?.total_value ?? 0}
            hint={t("assets.totalValueHint")}
          />
          <MoneyStat
            label={t("assets.maintenanceSpend")}
            value={money?.maintenance_spend ?? 0}
            hint={t("assets.maintenanceSpendHint")}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Every filter resets to page 1. Narrowing a list while sitting on
              page 4 shows an empty table, which reads as "no assets match" when
              in fact page 4 of the new filter simply does not exist. */}
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={t("assets.search")}
          />
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AssetStatus | "");
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">{t("assets.allStatuses")}</option>
            {(["available", "assigned", "maintenance", "retired"] as AssetStatus[]).map((v) => (
              <option key={v} value={v}>
                {t(`assets.status.${v}`)}
              </option>
            ))}
          </select>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">{t("assets.allCategories")}</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.uuid} value={c.uuid}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          total={list.data?.total ?? 0}
          page={list.data?.page ?? 1}
          totalPages={list.data?.totalPages ?? 1}
          onPageChange={setPage}
          loading={list.isLoading}
          onRowClick={(r) => setDetailUuid(r.uuid)}
          emptyIcon={Package}
          emptyTitle={t("assets.noAssets")}
          emptyDescription={t("assets.noAssetsDescription")}
        />
      </div>

      <AssetDetailDrawer
        uuid={detailUuid}
        onChanged={invalidate}
        onOpenChangeClose={() => setDetailUuid(null)}
      />

      <AssetDialog
        kind={dialog}
        asset={active}
        categories={categories.data ?? []}
        onClose={() => {
          setDialog(null);
          setActive(null);
        }}
        onSaved={() => {
          invalidate();
          setDialog(null);
          setActive(null);
        }}
      />
    </ModuleGate>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

/**
 * A money figure the SERVER computed.
 *
 * `hint` states what the number does and does not include, because an
 * unexplained total is how a register gets disbelieved: someone compares it to
 * the finance ledger, finds a difference, and stops trusting the page.
 */
function MoneyStat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{formatCurrency(value)}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Actions per status, mirroring the transitions the backend accepts.
 *
 * Retired offers Reinstate because retirement is otherwise terminal: a laptop
 * written off in error would be permanently stuck, and the ledger would keep a
 * wrong entry with no way to correct it.
 */
function RowActions({
  row,
  onOpenDetails,
  onDialog,
}: {
  row: Asset;
  onOpenDetails: () => void;
  onDialog: (kind: "edit" | "assign" | "return" | "maintenance" | "retire") => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["assets"] });
      await qc.invalidateQueries({ queryKey: ["assets-summary"] });
    } catch (e) {
      // The call site is `void run(...)`, which throws away the promise, so a
      // rejection here was previously invisible AND an unhandled rejection: the
      // button simply did nothing. Every other mutation in this module surfaces
      // its failure; this one has to as well.
      toast.error(apiErrorMessage(e, t("assets.actionFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* stopPropagation: the row is clickable and opens the drawer, so the
            menu trigger must not also fire that. */}
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          title={t("common.actions")}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onOpenDetails}>
          <FileText className="mr-2 h-4 w-4" />
          {t("assets.viewDetails")}
        </DropdownMenuItem>

        {row.status === "available" || row.status === "assigned" ? (
          <DropdownMenuItem onSelect={() => onDialog("edit")}>
            <FileText className="mr-2 h-4 w-4" />
            {t("common.edit")}
          </DropdownMenuItem>
        ) : null}

        {row.status === "available" ? (
          <>
            <DropdownMenuItem onSelect={() => onDialog("assign")}>
              <Send className="mr-2 h-4 w-4" />
              {t("assets.assign")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDialog("maintenance")}>
              <Wrench className="mr-2 h-4 w-4" />
              {t("assets.sendForMaintenance")}
            </DropdownMenuItem>
          </>
        ) : null}

        {row.status === "assigned" ? (
          <DropdownMenuItem onSelect={() => onDialog("return")}>
            <Undo2 className="mr-2 h-4 w-4" />
            {t("assets.returnAsset")}
          </DropdownMenuItem>
        ) : null}

        {row.status === "maintenance" ? (
          <DropdownMenuItem disabled>
            <Wrench className="mr-2 h-4 w-4" />
            {t("assets.inMaintenance")}
          </DropdownMenuItem>
        ) : null}

        {/* Retire is available-only, and that is the server's rule, not a UI
            preference: retireAsset refuses an `assigned` asset ("Return this
            asset before retiring it") and a `maintenance` one ("Close the open
            maintenance job first"). Offering it on those rows was a menu item
            whose only possible outcome was a 409 - which teaches people the page
            is broken. The two ways out are already above: Return for assigned,
            and the drawer's "mark repaired" for maintenance. */}
        {row.status === "available" ? (
          <DropdownMenuItem onSelect={() => onDialog("retire")}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t("assets.retire")}
          </DropdownMenuItem>
        ) : null}

        {row.status === "retired" ? (
          <DropdownMenuItem onSelect={() => void run(() => assetsService.reinstate(row.uuid))}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t("assets.reinstate")}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Detail drawer: custody history, maintenance, receipts
// ---------------------------------------------------------------------------

function AssetDetailDrawer({
  uuid,
  onChanged,
  onOpenChangeClose,
}: {
  uuid: string | null;
  onChanged: () => void;
  onOpenChangeClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const open = Boolean(uuid);

  const detail = useQuery({
    queryKey: ["asset", uuid],
    queryFn: () => assetsService.get(uuid!),
    enabled: open,
  });

  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [jobFiles, setJobFiles] = useState<File[]>([]);
  const [activeJob, setActiveJob] = useState<string | null>(null);

  const uploadReceipt = useMutation({
    mutationFn: () => assetsService.uploadReceipts(uuid!, receiptFiles),
    onSuccess: () => {
      setReceiptFiles([]);
      void qc.invalidateQueries({ queryKey: ["asset", uuid] });
      onChanged();
    },
  });

  const uploadInvoice = useMutation({
    mutationFn: () => assetsService.uploadInvoices(activeJob!, jobFiles),
    onSuccess: () => {
      setJobFiles([]);
      void qc.invalidateQueries({ queryKey: ["asset", uuid] });
      onChanged();
    },
  });

  const closeJob = useMutation({
    mutationFn: (vars: { jobUuid: string; status: "completed" | "cancelled" }) =>
      assetsService.completeMaintenance(vars.jobUuid, { status: vars.status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["asset", uuid] });
      onChanged();
    },
  });

  const asset = detail.data;

  /**
   * Re-read this asset. Used after any attachment change, so a removed receipt
   * leaves the list immediately rather than lingering until the panel is reopened.
   */
  const refreshDetail = () => {
    void qc.invalidateQueries({ queryKey: ["asset", uuid] });
    onChanged();
  };

  return (
    // Sheet, not Drawer. `Drawer` is vaul, which is a MOBILE BOTTOM SHEET: it
    // ignores `w-full max-w-*` and slides up from the bottom edge, so on a
    // narrow viewport the detail panel was clipped off-screen with no reachable
    // close control. Sheet is the Radix side-panel primitive: fixed
    // inset-y-0 right-0, a dimmed backdrop, and a close button in its top-right
    // corner. That is the shape this was always meant to be.
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setActiveJob(null);
          setJobFiles([]);
        }
        // onChanged is deliberately NOT called on close: closing a panel is not
        // a mutation, and refreshing the table behind it made the list flicker
        // every time someone glanced at an asset.
        onOpenChangeClose();
      }}
    >
      {/* max-w-lg rather than the default sm:max-w-sm: the custody history and
          receipt rows are two-column and unusable at the narrower width.
          overflow-y-auto on the PANEL, so the page behind never scrolls.
          max-w-2xl rather than max-w-lg: at the narrower width the attachment
          cards were squeezed until they clipped their own right edge. Widening
          cannot add a nested scrollbar, because the panel is already the only
          scroll container. */}
      <SheetContent
        side="right"
        className="w-full max-w-2xl gap-0 overflow-y-auto p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle>{asset ? `${asset.asset_tag} — ${asset.name}` : t("loading")}</SheetTitle>
          <SheetDescription>
            {asset ? t("assets.detailDescription", { category: asset.category_name ?? "—" }) : ""}
          </SheetDescription>
        </SheetHeader>

        {detail.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">{t("loading")}</p>
        ) : !asset ? (
          <p className="p-5 text-sm text-destructive">{t("assets.notFound")}</p>
        ) : (
          <div className="space-y-6 px-5 pb-8">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <Detail label={t("common.status")}>
                <Badge variant={ASSET_STATUS_VARIANT[asset.status]}>
                  {t(`assets.status.${asset.status}`)}
                </Badge>
              </Detail>
              <Detail label={t("assets.serialNumber")}>{asset.serial_number ?? "—"}</Detail>
              <Detail label={t("assets.purchaseDate")}>
                {asset.purchase_date ? formatDate(asset.purchase_date) : "—"}
              </Detail>
              <Detail label={t("assets.cost")}>{formatCurrency(asset.purchase_cost)}</Detail>
              <Detail label={t("assets.vendor")}>{asset.vendor ?? "—"}</Detail>
              <Detail label={t("assets.warranty")}>
                {asset.warranty_expires_at ? formatDate(asset.warranty_expires_at) : "—"}
              </Detail>
            </dl>

            {/* ---- notes ----
                Notes are not decoration here. retireAsset APPENDS "Retired: <reason>"
                to this column, so on a scrapped asset this is the only place the
                reason is readable — and the edit menu item is hidden for retired
                rows, so the drawer is the only place it could ever appear. */}
            {asset.notes ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t("assets.notes")}</h3>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {asset.notes}
                </p>
              </section>
            ) : null}

            {/* ---- custody history ---- */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t("assets.custodyHistory")}</h3>
              {asset.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("assets.neverAssigned")}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {asset.assignments.map((a) => (
                    <li key={a.uuid} className="flex items-start justify-between gap-2">
                      <span>
                        {a.employee_name}
                        <span className="block text-xs text-muted-foreground">
                          {formatDateTime(a.assigned_at)}
                          {a.returned_at
                            ? ` — ${t("assets.returned")} ${formatDateTime(a.returned_at)}`
                            : ""}
                        </span>
                      </span>
                      {!a.returned_at ? (
                        <Badge variant="secondary">{t("assets.currentHolder")}</Badge>
                      ) : a.return_condition && a.return_condition !== "good" ? (
                        <Badge variant="outline">
                          {t(`assets.condition.${a.return_condition}`)}
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ---- maintenance ---- */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t("assets.maintenance")}</h3>
              {asset.maintenance.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("assets.noMaintenance")}</p>
              ) : (
                <ul className="space-y-3">
                  {asset.maintenance.map((job) => (
                    <li key={job.uuid} className="rounded-md border p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{job.title}</span>
                        <Badge variant={job.status === "open" ? "outline" : "secondary"}>
                          {t(`assets.jobStatus.${job.status}`)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {job.vendor ?? "—"}
                        {job.cost != null ? ` · ${formatCurrency(job.cost)}` : ""} ·{" "}
                        {formatDateTime(job.reported_at)}
                      </p>

                      {job.completion_notes ? (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                          {job.completion_notes}
                        </p>
                      ) : null}

                      {(job.invoices ?? []).map((inv) => (
                        <AttachmentRow key={inv.uuid} file={inv} refresh={refreshDetail} />
                      ))}

                      {activeJob === job.uuid ? (
                        <div className="mt-2 space-y-2">
                          <FileDropzone
                            value={jobFiles}
                            onChange={setJobFiles}
                            label={t("assets.invoice")}
                            accept=".pdf,.jpg,.jpeg,.png"
                            maxFiles={3}
                          />
                          <Button
                            size="sm"
                            disabled={jobFiles.length === 0 || uploadInvoice.isPending}
                            onClick={() => uploadInvoice.mutate()}
                          >
                            {t("assets.upload")}
                          </Button>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {job.status === "open" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  closeJob.mutate({ jobUuid: job.uuid, status: "completed" })
                                }
                                disabled={closeJob.isPending}
                              >
                                {t("assets.markRepaired")}
                              </Button>
                              {/* Cancel is not the same as complete, and offering only
                                  "complete" made a false record: a job raised in error,
                                  or one the asset turned out not to need, could only be
                                  closed as a repair that happened. It also matters to
                                  maintenance_spend, which counts COMPLETED jobs - so a
                                  wrongly completed job permanently inflates the money
                                  the dashboard reports as spent. */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  closeJob.mutate({ jobUuid: job.uuid, status: "cancelled" })
                                }
                                disabled={closeJob.isPending}
                              >
                                {t("assets.cancelMaintenance")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setActiveJob(job.uuid)}
                              >
                                {t("assets.addInvoice")}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {closeJob.isError ? (
                <p className="mt-2 text-sm text-destructive">
                  {apiErrorMessage(closeJob.error, t("assets.actionFailed"))}
                </p>
              ) : null}
            </section>

            {/* ---- receipts ---- */}
            <section>
              <h3 className="mb-2 text-sm font-semibold">{t("assets.receipts")}</h3>
              {asset.receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("assets.noReceipts")}</p>
              ) : (
                asset.receipts.map((r) => (
                  <AttachmentRow key={r.uuid} file={r} refresh={refreshDetail} />
                ))
              )}

              <FileDropzone
                value={receiptFiles}
                onChange={setReceiptFiles}
                label={t("assets.purchaseReceipt")}
                accept=".pdf,.jpg,.jpeg,.png"
                maxFiles={3}
              />
              <Button
                size="sm"
                className="mt-2"
                disabled={receiptFiles.length === 0 || uploadReceipt.isPending}
                onClick={() => uploadReceipt.mutate()}
              >
                <Download className="mr-2 h-4 w-4" />
                {t("assets.upload")}
              </Button>
              {uploadReceipt.isError ? (
                <p className="mt-2 text-sm text-destructive">
                  {apiErrorMessage(uploadReceipt.error, t("assets.uploadFailed"))}
                </p>
              ) : null}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * One attachment inside a list.
 *
 * Wraps AttachmentCard rather than reimplementing it, so the receipts section and
 * the per-job invoices section behave identically: both can preview, download and
 * remove, and neither can render a filename as inert text.
 *
 * `refresh` is passed down so a removal re-reads the asset and the mutations that
 * follow it are visibly current - deleting a receipt otherwise left the row on
 * screen until the panel was reopened.
 */
function AttachmentRow({ file, refresh }: { file: AssetAttachment; refresh: () => void }) {
  return (
    <div className="mt-2">
      <AttachmentCard attachment={file} onDeleted={refresh} />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs: create/edit, assign, return, maintenance, retire
// ---------------------------------------------------------------------------

type AssetForm = {
  category_uuid: string;
  name: string;
  asset_tag: string;
  model_details: string;
  serial_number: string;
  purchase_date: string;
  purchase_cost: string;
  vendor: string;
  warranty_expires_at: string;
  notes: string;
};

function AssetDialog({
  kind,
  asset,
  categories,
  onClose,
  onSaved,
}: {
  kind: string | null;
  asset: Asset | null;
  categories: { uuid: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const open = Boolean(kind);

  const form = useForm<AssetForm>({
    defaultValues: {
      category_uuid: "",
      name: "",
      asset_tag: "",
      model_details: "",
      serial_number: "",
      purchase_date: "",
      purchase_cost: "",
      vendor: "",
      warranty_expires_at: "",
      notes: "",
    },
  });
  const { reset, setValue } = form;
  const wasOpen = useRef(false);

  // Seed on open only. Re-seeding on every render would discard whatever the
  // user had typed the moment any unrelated query refreshed.
  useEffect(() => {
    if (open && !wasOpen.current) {
      if (kind === "edit" && asset) {
        reset({
          category_uuid: asset.category_uuid,
          name: asset.name,
          asset_tag: asset.asset_tag,
          model_details: asset.model_details ?? "",
          serial_number: asset.serial_number ?? "",
          purchase_date: asset.purchase_date ?? "",
          purchase_cost: asset.purchase_cost == null ? "" : String(asset.purchase_cost),
          vendor: asset.vendor ?? "",
          warranty_expires_at: asset.warranty_expires_at ?? "",
          notes: asset.notes ?? "",
        });
      } else if (kind === "create") {
        reset({
          category_uuid: categories[0]?.uuid ?? "",
          name: "",
          asset_tag: "",
          model_details: "",
          serial_number: "",
          purchase_date: "",
          purchase_cost: "",
          vendor: "",
          warranty_expires_at: "",
          notes: "",
        });
      }
    }
    wasOpen.current = open;
  }, [open, kind, asset, categories, reset]);

  const save = useMutation({
    mutationFn: async (values: AssetForm) => {
      const text = (raw: string) => raw.trim();
      const shared = { category_uuid: values.category_uuid, name: values.name.trim() };
      const costText = text(values.purchase_cost);

      // On create an empty optional field is simply omitted.
      const omit = (raw: string) => text(raw) || undefined;

      // On edit an empty optional field is a CLEAR, and the wire format for a
      // clear is null. The server distinguishes the two: buildUpdate skips
      // undefined ("field absent") and writes null ("clear this"). Sending
      // undefined for a field the user just emptied is therefore how clearing
      // Vendor or Cost silently kept the old value forever - the form looked
      // saved and the register disagreed.
      const clear = (raw: string) => text(raw) || null;

      if (kind === "edit" && asset) {
        return assetsService.update(asset.uuid, {
          ...shared,
          asset_tag: values.asset_tag.trim(),
          model_details: clear(values.model_details),
          serial_number: clear(values.serial_number),
          purchase_date: clear(values.purchase_date),
          purchase_cost: costText ? Number(costText) : null,
          vendor: clear(values.vendor),
          warranty_expires_at: clear(values.warranty_expires_at),
          notes: clear(values.notes),
        });
      }
      return assetsService.create({
        ...shared,
        asset_tag: values.asset_tag.trim() || undefined,
        model_details: omit(values.model_details),
        serial_number: omit(values.serial_number),
        purchase_date: omit(values.purchase_date),
        purchase_cost: costText ? Number(costText) : undefined,
        vendor: omit(values.vendor),
        warranty_expires_at: omit(values.warranty_expires_at),
        notes: omit(values.notes),
      });
    },
    onSuccess: onSaved,
  });

  // Default the category once the list arrives, but only while creating.
  useEffect(() => {
    if (kind === "create" && categories.length && !form.getValues("category_uuid")) {
      setValue("category_uuid", categories[0].uuid);
    }
  }, [kind, categories, setValue, form]);

  if (kind === "assign" || kind === "return" || kind === "maintenance" || kind === "retire") {
    return (
      <ActionDialog
        kind={kind}
        asset={asset}
        onClose={onClose}
        onDone={() => {
          onSaved();
        }}
      />
    );
  }

  const title =
    kind === "edit" ? t("assets.editAsset") : kind === "create" ? t("assets.newAsset") : "";

  return (
    <FormDialog
      open={open && (kind === "create" || kind === "edit")}
      onOpenChange={(v) => !v && onClose()}
      title={title}
      description={t("assets.assetFormDescription")}
      submitLabel={t("common.save")}
      cancelLabel={t("common.cancel")}
      onSubmit={(v) => save.mutateAsync(v)}
      form={form}
      size="lg"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("assets.category")}</span>
          <select
            {...form.register("category_uuid", { required: true })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {categories.map((c) => (
              <option key={c.uuid} value={c.uuid}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("assets.assetName")}</span>
          <input
            {...form.register("name", { required: t("assets.assetName") })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("assets.tag")}</span>
          <input
            {...form.register("asset_tag")}
            placeholder={t("assets.tagAuto")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("assets.modelDetails")}</span>
          <input
            {...form.register("model_details")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("assets.serialNumber")}</span>
          <input
            {...form.register("serial_number")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("assets.vendor")}</span>
          <input
            {...form.register("vendor")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("assets.purchaseDate")}</span>
          <input
            type="date"
            {...form.register("purchase_date")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("assets.cost")}</span>
          <input
            type="number"
            step="0.01"
            min={0}
            {...form.register("purchase_cost")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>

        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="font-medium">{t("assets.warranty")}</span>
          <input
            type="date"
            {...form.register("warranty_expires_at")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>

        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="font-medium">{t("assets.notes")}</span>
          <textarea
            {...form.register("notes")}
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </label>
      </div>

      {save.isError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {apiErrorMessage(save.error, t("assets.saveFailed"))}
        </p>
      ) : null}
    </FormDialog>
  );
}

/** The single-click lifecycle transitions: assign, return, maintenance, retire. */
function ActionDialog({
  kind,
  asset,
  onClose,
  onDone,
}: {
  kind: string;
  asset: Asset | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [employee, setEmployee] = useState("");
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [vendor, setVendor] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!wasOpen.current) {
      setEmployee("");
      setCondition("good");
      setNotes("");
      setTitle("");
      setVendor("");
      setCost("");
      setReason("");
    }
    wasOpen.current = true;
  }, [kind]);

  // Employees are only fetched when the assign dialog is actually open: the
  // list is large and nobody else needs it.
  //
  // limit is the API's maxLimit (parsePagination defaults to 100), so asking for
  // 200 did not fetch 200 — it silently fetched 100, and with a bigger roster the
  // employees past the cap were simply not in the picker. Raised to the real
  // ceiling and, more importantly, the list is FILTERED client-side below and the
  // count is surfaced, so a capped list can never read as "that is everyone".
  const employees = useQuery({
    queryKey: ["org-employees", "asset-assign"],
    // scope=org: the default list is "employee records I personally added", which
    // is a work queue for the Employees page and the wrong set for a picker over
    // the company. Without it an org_admin cannot hand a laptop to a colleague
    // another admin onboarded - the person is not merely hidden, they are absent.
    queryFn: () => orgService.employees({ page: 1, limit: 100, scope: "org" }),
    enabled: kind === "assign" && Boolean(asset),
  });

  const employeeList = useMemo(() => employees.data?.items ?? [], [employees.data]);

  /** Only people who could be assigned: on the roster and not already left. */
  const assignable = useMemo(
    () => employeeList.filter((e) => isCurrentEmployee(e.status)),
    [employeeList],
  );

  const [employeeQuery, setEmployeeQuery] = useState("");
  /**
   * The picker searches name, email and CNIC, but shows the name. Email and CNIC
   * ride along as invisible keywords rather than being rendered, because nobody
   * reads an assignment form to find out someone's national ID.
   *
   * Someone with no portal account stays in the list and stays marked: the
   * assignment is legitimate, only their ability to SEE it is missing. Hiding
   * them would make a real employee look absent from the company.
   */
  const employeeOptions = useMemo<SearchableSelectItem[]>(
    () =>
      assignable.map((e) => ({
        value: e.uuid,
        label: e.full_name,
        hint: [e.designation, e.linked_user_uuid ? null : t("assets.noPortalAccount")]
          .filter(Boolean)
          .join(" · "),
        keywords: `${e.email ?? ""} ${e.cnic ?? ""}`,
      })),
    [assignable, t],
  );

  /**
   * The chosen employee, and whether they can actually see the assignment.
   *
   * /my/assets resolves the employee FROM the session via
   * employees.linked_user_uuid. An employee with no portal account will therefore
   * never see this asset, while every staff view shows it as assigned and the
   * stock count drops. Warning here is the only moment anyone can still fix it.
   */
  const chosenEmployee = useMemo(
    () => assignable.find((e) => e.uuid === employee) ?? null,
    [assignable, employee],
  );
  const chosenHasNoAccount = Boolean(chosenEmployee && !chosenEmployee.linked_user_uuid);

  const act = useMutation({
    mutationFn: async () => {
      if (!asset) throw new Error("no asset");
      if (kind === "assign") {
        if (!employee) throw new Error(t("assets.pickEmployee"));
        return assetsService.assign(asset.uuid, employee);
      }
      if (kind === "return") {
        return assetsService.return(asset.uuid, condition as "good", notes || undefined);
      }
      if (kind === "maintenance") {
        return assetsService.reportMaintenance(asset.uuid, {
          title: title.trim(),
          vendor: vendor || undefined,
          cost: cost ? Number(cost) : undefined,
        });
      }
      return assetsService.retire(asset.uuid, reason || undefined);
    },
    onSuccess: onDone,
  });

  const titles: Record<string, string> = {
    assign: t("assets.assign"),
    return: t("assets.returnAsset"),
    maintenance: t("assets.sendForMaintenance"),
    retire: t("assets.retire"),
  };

  return (
    <FormDialog
      open={Boolean(asset)}
      onOpenChange={(v) => !v && onClose()}
      title={titles[kind] ?? ""}
      description={asset ? `${asset.asset_tag} — ${asset.name}` : ""}
      submitLabel={t("common.save")}
      cancelLabel={t("common.cancel")}
      onSubmit={() => act.mutateAsync()}
      hideFooter={false}
    >
      {kind === "assign" ? (
        <div className="space-y-2">
          <div className="space-y-1 text-sm">
            <span className="font-medium">{t("assets.assignTo")}</span>
            <SearchableSelect
              items={employeeOptions}
              value={employee}
              onChange={setEmployee}
              placeholder={t("assets.pickEmployee")}
              searchPlaceholder={t("assets.searchEmployees")}
              emptyText={t("assets.noEmployeesMatch")}
              search={employeeQuery}
              onSearchChange={setEmployeeQuery}
            />
          </div>

          {/* A capped page must never read as "everyone". Silently showing 100 of
              250 employees is how someone gets told "that person is not here"
              when they simply were not fetched. */}
          {employees.data && employees.data.total > employeeList.length ? (
            <p className="text-xs text-muted-foreground">
              {t("assets.employeesTruncated", {
                shown: employeeList.length,
                total: employees.data.total,
              })}
            </p>
          ) : null}

          {chosenHasNoAccount ? (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {t("assets.assignNoPortalAccount")}
            </p>
          ) : null}
        </div>
      ) : null}

      {kind === "return" ? (
        <>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("assets.conditionOnReturn")}</span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="good">{t("assets.condition.good")}</option>
              <option value="damaged">{t("assets.condition.damaged")}</option>
              <option value="needs_maintenance">{t("assets.condition.needs_maintenance")}</option>
            </select>
          </label>
          {/* Explains the consequence: a damaged return opens a repair job, which
              changes the asset's status. Doing that without warning is how a
              returned item stays broken. */}
          {condition !== "good" ? (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              {t("assets.conditionOpensMaintenance")}
            </p>
          ) : null}
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("assets.notes")}</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
          </label>
        </>
      ) : null}

      {kind === "maintenance" ? (
        <>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("assets.jobTitle")}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("assets.vendor")}</span>
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("assets.cost")}</span>
            <input
              type="number"
              step="0.01"
              min={0}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            />
          </label>
        </>
      ) : null}

      {kind === "retire" ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("assets.retireReason")}</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
          {/* Retirement is terminal except via Reinstate, so the consequence is
              stated before the click rather than discovered later. */}
          <span className="text-xs text-muted-foreground">{t("assets.retireWarning")}</span>
        </label>
      ) : null}

      {act.isError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {apiErrorMessage(act.error, t("assets.actionFailed"))}
        </p>
      ) : null}
    </FormDialog>
  );
}
