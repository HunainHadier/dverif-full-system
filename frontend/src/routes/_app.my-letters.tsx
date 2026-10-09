import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileSignature, Download, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, DataTableToolbar, type DataTableColumn } from "@/components/hr/DataTable";
import {
  myLettersService,
  HR_LETTER_TYPES,
  type HrLetterListItem,
  type HrLetterType,
} from "@/services";

/**
 * Employee portal: my letters.
 *
 * Read-only by design. The employee cannot issue, revoke or draft —” those are
 * org-admin actions under /org/hr-letters. What an employee needs from a letter is
 * to download it and to show a bank or a new employer that it is genuine, so the
 * verification link is surfaced on every row rather than hidden behind a detail
 * page.
 *
 * ModuleGate rather than RequireOrgFeature: plan-level access, not role
 * delegation. The route itself is employee-only in ROUTE_ACCESS, which is the
 * role axis.
 */
export const Route = createFileRoute("/_app/my-letters")({
  component: MyLettersPage,
});

function MyLettersPage() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<HrLetterType | "">("");

  const query = useQuery({
    queryKey: ["my-letters", page, typeFilter],
    queryFn: () => myLettersService.list({ page, limit: 20, letter_type: typeFilter || undefined }),
  });

  const columns: DataTableColumn<HrLetterListItem>[] = [
    {
      key: "reference_no",
      header: t("letters.referenceNo"),
      render: (r) => <span className="font-mono text-xs">{r.reference_no}</span>,
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
      key: "title",
      header: t("common.review"),
      render: (r) => <span className="text-sm">{r.title}</span>,
    },
    {
      key: "issued_at",
      header: t("letters.issuedAt"),
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.issued_at ? new Date(r.issued_at).toLocaleDateString("en-PK") : "—”"}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      className: "text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          {r.verify_url ? (
            <Button variant="ghost" size="icon" asChild title={t("letters.viewVerification")}>
              <a href={r.verify_url} target="_blank" rel="noreferrer">
                <ShieldCheck className="h-4 w-4" />
              </a>
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            title={t("letters.downloadPdf")}
            onClick={async () => {
              const blob = await myLettersService.downloadPdf(r.uuid);
              const url = URL.createObjectURL(blob);
              window.open(url, "_blank");
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ModuleGate module="hr_letters_management">
      <div className="space-y-4">
        <PageHeader title={t("letters.myTitle")} description={t("letters.myDescription")} />

        <DataTableToolbar>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={typeFilter === "" ? "default" : "outline"}
              onClick={() => {
                setTypeFilter("");
                setPage(1);
              }}
            >
              {t("letters.all")}
            </Button>
            {HR_LETTER_TYPES.slice(0, 4).map((lt) => (
              <Button
                key={lt.key}
                size="sm"
                variant={typeFilter === lt.key ? "default" : "outline"}
                onClick={() => {
                  setTypeFilter(lt.key);
                  setPage(1);
                }}
              >
                {lt.label}
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
            emptyTitle={t("letters.myEmptyTitle")}
            emptyDescription={t("letters.myEmptyDescription")}
          />
        )}
      </div>
    </ModuleGate>
  );
}
