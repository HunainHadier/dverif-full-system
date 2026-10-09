import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Package, ShieldCheck } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { PageHeader } from "@/components/common/PageHeader";
import { myAssetsService, type MyAsset } from "@/services";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/my-assets")({
  head: () => ({ meta: [{ title: "My Assets — Dverif" }] }),
  component: MyAssetsPage,
});

/**
 * Employee self-service: the equipment currently assigned to me.
 *
 * READ ONLY, deliberately. There is no assign, return or retire control here, and
 * adding one would be wrong twice over: the employee is not the custodian of the
 * company's decision to reissue a laptop, and the server derives status from rows
 * that only the service may write. "Return it" is a conversation with HR, and the
 * dialog that would need to open does not exist.
 *
 * The endpoint takes no parameters at all - the employee comes from the session -
 * so there is no way to reach another person's hardware from here.
 */
function MyAssetsPage() {
  const { t } = useTranslation();

  const assets = useQuery({
    queryKey: ["my-assets"],
    queryFn: () => myAssetsService.list(),
  });

  const columns: DataTableColumn<MyAsset>[] = [
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
      // The serial is what an employee quotes when reporting a fault or asking
      // whether a replacement is the same machine, so it gets its own column
      // rather than being buried in the details.
      key: "serial_number",
      header: t("assets.serialNumber"),
      render: (r) => <span className="font-mono text-xs">{r.serial_number ?? "—"}</span>,
    },
    {
      key: "assigned_at",
      header: t("assets.assignedDate"),
      render: (r) => (
        <span className="text-sm text-muted-foreground">{formatDate(r.assigned_at)}</span>
      ),
    },
    {
      key: "warranty_expires_at",
      header: t("assets.warranty"),
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.warranty_expires_at ? formatDate(r.warranty_expires_at) : "—"}
        </span>
      ),
    },
  ];

  const rows = assets.data ?? [];

  return (
    <ModuleGate module="asset_management">
      <div className="space-y-4">
        <PageHeader title={t("myAssets.title")} description={t("myAssets.description")} />

        <DataTable
          columns={columns}
          rows={rows}
          loading={assets.isLoading}
          emptyIcon={Package}
          emptyTitle={t("myAssets.empty")}
          emptyDescription={t("myAssets.emptyDescription")}
        />

        {/* Says what to do about a discrepancy. Without it the empty state is
            indistinguishable from a broken query, and an employee whose laptop
            is missing has no obvious next step. */}
        <p className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          {t("myAssets.reportIssue")}
        </p>
      </div>
    </ModuleGate>
  );
}
