import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { History } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { adminLoginHistoryService } from "@/services";
import { TableSkeleton } from "./_app.requests";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/login-history")({
  head: () => ({ meta: [{ title: "Login History — Dverif Admin" }] }),
  component: AdminLoginHistoryPage,
});

function AdminLoginHistoryPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [successFilter, setSuccessFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const list = useQuery({
    queryKey: ["admin-login-history", page, search, successFilter, dateFrom, dateTo],
    queryFn: () =>
      adminLoginHistoryService.list({
        page,
        limit: 20,
        search,
        success: successFilter === "all" ? undefined : successFilter,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const items = list.data?.items ?? [];

  const successBadge = (success: string) => {
    const isYes = success === "yes";
    return (
      <Badge
        variant="outline"
        className={`rounded-full ${
          isYes
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
        }`}
      >
        {isYes ? "Success" : "Failed"}
      </Badge>
    );
  };

  const typeBadge = (type: string) => {
    return (
      <Badge
        variant="outline"
        className={`rounded-full capitalize ${
          type === "admin"
            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
        }`}
      >
        {type}
      </Badge>
    );
  };

  return (
    <div>
      <PageHeader
        title="Login History"
        description="View all login attempts across the platform with IP addresses and timestamps."
      />

      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder="Search email, name, IP…"
              />
              <Select
                value={successFilter}
                onValueChange={(v) => {
                  setSuccessFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="yes">Success only</SelectItem>
                  <SelectItem value="no">Failed only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  className="w-[150px]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  className="w-[150px]"
                />
              </div>
            </div>
          </div>
          {list.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={History} title="No login history yet" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>User Agent</TableHead>
                    <TableHead>Date & Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((entry, i) => (
                    <TableRow key={entry.uuid}>
                      <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                        {(page - 1) * 20 + i + 1}
                      </TableCell>
                      <TableCell data-label="User">
                        <div className="flex flex-col">
                          <span className="font-medium">{entry.full_name || "—"}</span>
                          <span className="text-xs text-muted-foreground">{entry.email || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell data-label="Type">{typeBadge(entry.identity_type)}</TableCell>
                      <TableCell data-label="Status">{successBadge(entry.success)}</TableCell>
                      <TableCell data-label="IP Address" className="font-mono text-xs text-muted-foreground">
                        {entry.ip_address || "—"}
                      </TableCell>
                      <TableCell data-label="User Agent" className="max-w-[200px] truncate text-xs text-muted-foreground" title={entry.user_agent || ""}>
                        {entry.user_agent || "—"}
                      </TableCell>
                      <TableCell data-label="Date & Time" className="text-xs text-muted-foreground">
                        {formatDateTime(entry.login_at)}
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
    </div>
  );
}
