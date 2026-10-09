import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LifeBuoy } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { PriorityBadge } from "./_app.org.support";
import { TableSkeleton } from "./_app.requests";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminSupportService, type SupportTicket } from "@/services";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/support/")({
  component: AdminSupportPage,
});

const PAGE_SIZE = 10;

type SupportStatus = SupportTicket["status"] | "all";
type SupportPriority = SupportTicket["priority"] | "all";

function AdminSupportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SupportStatus>("all");
  const [priority, setPriority] = useState<SupportPriority>("all");

  const list = useQuery({
    queryKey: ["adminSupport", page, search, status, priority],
    queryFn: () =>
      adminSupportService.list({
        page,
        limit: PAGE_SIZE,
        search,
        status: status === "all" ? undefined : status,
        priority: priority === "all" ? undefined : priority,
      }),
  });

  const items = list.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title={t("supportTickets.title")}
        description={t("supportTickets.description")}
      />

      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder={t("supportTickets.searchPlaceholder")}
            />
            <div className="flex flex-1 flex-col gap-3 sm:flex-row lg:justify-end">
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v as SupportStatus);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("supportTickets.statusColumn")}</SelectItem>
                  <SelectItem value="open">{t("status.open")}</SelectItem>
                  <SelectItem value="in_progress">{t("status.in_progress")}</SelectItem>
                  <SelectItem value="resolved">{t("status.resolved")}</SelectItem>
                  <SelectItem value="closed">{t("status.closed")}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={priority}
                onValueChange={(v) => {
                  setPriority(v as SupportPriority);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("supportTickets.priorityColumn")}</SelectItem>
                  <SelectItem value="low">{t("supportTickets.low")}</SelectItem>
                  <SelectItem value="medium">{t("supportTickets.medium")}</SelectItem>
                  <SelectItem value="high">{t("supportTickets.high")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {list.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={LifeBuoy}
                title={t("supportTickets.emptyTitle")}
                description={t("supportTickets.emptyDesc")}
              />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">S.No</TableHead>
                      <TableHead className="whitespace-nowrap">Organization</TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("supportTickets.raisedBy")}
                      </TableHead>
                      <TableHead>{t("supportTickets.subject")}</TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("supportTickets.priorityColumn")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("supportTickets.statusColumn")}
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        {t("supportTickets.updatedAt")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((tk, i) => (
                      <TableRow
                        key={tk.uuid}
                        className="cursor-pointer"
                        onClick={() =>
                          navigate({ to: "/admin/support/$uuid", params: { uuid: tk.uuid } })
                        }
                      >
                        <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                          {(page - 1) * PAGE_SIZE + i + 1}
                        </TableCell>
                        <TableCell data-label="Organization" className="whitespace-nowrap text-sm text-foreground">
                          {tk.organization_name ?? "—"}
                        </TableCell>
                        <TableCell data-label="Raised by" className="whitespace-nowrap">
                          <div className="text-sm font-medium text-foreground">
                            {tk.raised_by_name ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {tk.raised_by_email ?? ""}
                          </div>
                        </TableCell>
                        <TableCell data-label="Subject">
                          <button
                            type="button"
                            className="text-left text-sm font-medium text-foreground hover:underline"
                            onClick={() =>
                              navigate({ to: "/admin/support/$uuid", params: { uuid: tk.uuid } })
                            }
                          >
                            {tk.subject}
                          </button>
                        </TableCell>
                        <TableCell data-label="Priority" className="whitespace-nowrap">
                          <PriorityBadge priority={tk.priority} />
                        </TableCell>
                        <TableCell data-label="Status" className="whitespace-nowrap">
                          <StatusBadge status={tk.status} />
                        </TableCell>
                        <TableCell data-label="Updated at" className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(tk.updated_at)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={page}
                total={list.data?.total ?? 0}
                totalPages={list.data?.totalPages ?? 1}
                onChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
