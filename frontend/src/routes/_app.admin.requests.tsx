import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Eye, FileCheck2 } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { RequestDetailModal } from "@/components/common/RequestDetailModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { TableSkeleton } from "./_app.requests";
import { adminService, type UUID, type VerificationRequest } from "@/services";
import { formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/requests")({
  head: () => ({ meta: [{ title: "Verification Requests — Dverif Admin" }] }),
  component: AdminRequestsPage,
});

function AdminRequestsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewing, setViewing] = useState<VerificationRequest | null>(null);

  const list = useQuery({
    queryKey: ["admin-requests", page, search, status, dateFrom, dateTo],
    queryFn: () =>
      adminService.requests({
        page,
        limit: 10,
        search,
        status: status === "all" ? undefined : status,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const items = list.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="All verification requests"
        description="Every request across the network. Filter, search, and moderate as needed."
      />

      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search requests…"
            />
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-full sm:w-40"
              />
              <span className="text-xs text-muted-foreground max-sm:px-1">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-full sm:w-40"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="under_review">Under review</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {list.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={FileCheck2} title="No requests" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Issuing org</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Verified date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r, i) => (
                    <TableRow key={r.uuid}>
                      <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                        {(page - 1) * 10 + i + 1}
                      </TableCell>
                      <TableCell data-label="Document" className="font-medium text-foreground">
                        {r.document_type}
                      </TableCell>
                      <TableCell data-label="Requester" className="text-muted-foreground">
                        {r.requester_name ?? "—"}
                      </TableCell>
                      <TableCell data-label="Issuing org" className="text-muted-foreground">
                        {r.issuing_org_name ?? (
                          <span className="italic">
                            {r.unmatched_org_name ?? "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell data-label="Status">
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell data-label="Submitted" className="text-xs text-muted-foreground">
                        {formatDate(r.submitted_at)}
                      </TableCell>
                      <TableCell data-label="Verified date" className="text-xs text-muted-foreground">
                        {r.status === "under_review" ? "—" : formatDate(r.verified_at)}
                      </TableCell>
                      <TableCell data-label="Actions" className="text-right">
                        <div className="flex flex-wrap items-center justify-start gap-1 sm:justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => setViewing(r)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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

      <RequestDetailModal request={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
