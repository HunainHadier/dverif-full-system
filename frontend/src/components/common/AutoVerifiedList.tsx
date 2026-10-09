import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Eye, History, Inbox as InboxIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/EmptyState";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { RequestDetailModal } from "@/components/common/RequestDetailModal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableSkeleton } from "@/routes/_app.requests";
import { requestsService, type VerificationRequest } from "@/services";
import { formatDate } from "@/lib/utils";
import { tDocType } from "@/i18n";

/**
 * The read-only ledger of AUTOMATIC verification outcomes for this organization.
 *
 * Extracted so the same ledger can live in two places without drifting: on its
 * own page, and as the "Auto Approved" tab on the inbox. Both must show exactly
 * the same rows, and a second copy of this table would eventually stop matching
 * the first.
 *
 * These requests are deliberately NOT in the inbox. The inbox is the actionable
 * queue; an automatic decision has already been made and there is nothing for a
 * verifier to do, so listing it there mixed finished work in with work that
 * needed a human.
 */

const PAGE_SIZE = 10;

function countOf(value: number | string | null | undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function AutoVerifiedList({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [detail, setDetail] = useState<VerificationRequest | null>(null);

  const list = useQuery({
    queryKey: ["auto-verified", page, search, dateFrom, dateTo],
    queryFn: () =>
      requestsService.myAutoVerified({
        page,
        limit: PAGE_SIZE,
        search,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder={t("autoVerified.searchPlaceholder")}
            />
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:w-40"
                aria-label={t("autoVerified.fromDate")}
              />
              <span className="text-xs text-muted-foreground max-sm:px-1">{t("common.to")}</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:w-40"
                aria-label={t("autoVerified.toDate")}
              />
            </div>
          </div>

          {list.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={InboxIcon}
                title={t("autoVerified.emptyTitle")}
                description={t("autoVerified.emptyDesc")}
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">S.No</TableHead>
                      <TableHead>{t("autoVerified.document")}</TableHead>
                      <TableHead>{t("autoVerified.requester")}</TableHead>
                      <TableHead>{t("autoVerified.status")}</TableHead>
                      <TableHead className="text-center">{t("autoVerified.timesVerified")}</TableHead>
                      <TableHead>{t("autoVerified.verifiedDate")}</TableHead>
                      <TableHead className="text-right">{t("autoVerified.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((r, i) => (
                      <TableRow key={r.uuid}>
                        <TableCell className="w-10 text-muted-foreground">
                          {(page - 1) * PAGE_SIZE + i + 1}
                        </TableCell>
                        <TableCell
                          data-label={t("autoVerified.document")}
                          className="font-medium text-foreground"
                        >
                          <div>{tDocType(r.document_type)}</div>
                          {r.document_owner_name ? (
                            <div className="text-xs text-muted-foreground">
                              {r.document_owner_name}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell
                          data-label={t("autoVerified.requester")}
                          className="text-muted-foreground"
                        >
                          <div>{r.requester_name ?? "-"}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.requester_organization ?? r.requester_email}
                          </div>
                        </TableCell>
                        <TableCell data-label={t("autoVerified.status")}>
                          <StatusBadge status={r.status} />
                        </TableCell>
                        <TableCell
                          data-label={t("autoVerified.timesVerified")}
                          className="text-center"
                        >
                          <Badge
                            variant="secondary"
                            className="inline-flex min-w-9 justify-center bg-success/15 font-semibold text-success hover:bg-success/15"
                          >
                            {countOf(r.doc_verification_count)}
                          </Badge>
                        </TableCell>
                        <TableCell
                          data-label={t("autoVerified.verifiedDate")}
                          className="text-xs text-muted-foreground"
                        >
                          {formatDate(r.verified_at)}
                        </TableCell>
                        <TableCell
                          data-label={t("autoVerified.actions")}
                          className="text-right"
                        >
                          <div className="flex flex-wrap items-center justify-start gap-1 sm:justify-end">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title={t("autoVerified.viewHistory")}
                              onClick={() =>
                                navigate({ to: "/auto-verified/$uuid", params: { uuid: r.uuid } })
                              }
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title={t("autoVerified.viewRequest")}
                              onClick={() => setDetail(r)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 ? (
                <div className="border-t border-border p-4">
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={total}
                    onChange={setPage}
                  />
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <RequestDetailModal request={detail} onClose={() => setDetail(null)} />
    </>
  );
}
