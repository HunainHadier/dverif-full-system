import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp, ScrollText } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { adminAuditLogService, type AuditLogRecord } from "@/services";
import { TableSkeleton } from "./_app.requests";
import { formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/activity-logs")({
  head: () => ({ meta: [{ title: "Activity Logs — Dverif Admin" }] }),
  component: AdminActivityLogsPage,
});

const ACTION_LABELS: Record<string, string> = {
  "user.create": "User created",
  "user.update": "User updated",
  "user.delete": "User deleted",
  "user.invite_resend": "Invite resent",
  "user.invite_cancelled": "Invitation cancelled",
  "user.removed_permanently": "User removed permanently",
  "user.org_role_update": "Organization role changed",
  "organization.create": "Organization created",
  "organization.update": "Organization updated",
  "organization.delete": "Organization deleted",
  "subscription.set": "Subscription set",
  "subscription.cancel": "Subscription cancelled",
  "request.create": "Request created",
  "request.update": "Request updated",
  "request.delete": "Request deleted",
  "request.verify": "Request verified",
  "request.reject": "Request rejected",
  "request.lock": "Request locked",
  "request.unlock": "Request unlocked",
  "unmatched_org.assign": "Unmatched org assigned",
  "employee.create": "Employee added",
  "employee.update": "Employee updated",
  "employee.delete": "Employee deleted",
  "employee.promote": "Employee promoted",
  "subadmin.create": "Sub-admin created",
  "subadmin.access_update": "Sub-admin permissions updated",
  "subadmin.revoke": "Sub-admin revoked",
  "attendance.check_in": "Attendance check-in",
  "attendance.check_out": "Attendance check-out",
  "attendance.manual_entry": "Manual attendance entry",
  "attendance.ip_add": "Office IP allow-list updated",
  "attendance.ip_remove": "Office IP allow-list updated",
  "leave.create": "Leave requested",
  "leave_type.create": "Leave type created",
  "leave_type.update": "Leave type updated",
  "leave_type.delete": "Leave type deleted",
  "salary_record.create": "Salary record created",
  "payment.create": "Payment recorded",
  "admin.profile_update": "Admin profile updated",
  "lead.contact.status_update": "Contact lead status updated",
  "lead.access_request.status_update": "Access request status updated",
};

function actionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}

/* ── details helpers ─────────────────────────────────────────────── */

function parseDetails(details: AuditLogRecord["details"]): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === "string") {
    try {
      const parsed = JSON.parse(details);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof details === "object" ? details : null;
}

const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

function fieldsPart(d: Record<string, unknown> | null): string {
  const fields = Array.isArray(d?.fields) ? d.fields.filter((f) => typeof f === "string") : [];
  return fields.length ? ` (${fields.join(", ")})` : "";
}

const DETAIL_LABELS: Record<string, string> = {
  user_uuid: "User UUID",
  email: "Email",
  full_name: "Full name",
  email_sent: "Email sent",
  organization: "Organization",
  organization_id: "Organization ID",
  fields: "Fields changed",
  name: "Name",
  days: "Days per year",
  month: "Month",
  year: "Year",
  net_salary: "Net salary",
  amount: "Amount",
  payment_method: "Payment method",
  plan: "Plan",
  document_type: "Document type",
  employee_name: "Employee",
  check_in_time: "Check-in time",
  check_out_time: "Check-out time",
  date: "Date",
  reason: "Reason",
  ip: "IP address",
  start_date: "Start date",
  end_date: "End date",
  leave_type: "Leave type",
  org_role: "New role",
  feature_access: "Feature access",
  method: "Method",
  status: "Status",
  description: "Description",
  remarks: "Remarks",
  old_status: "Old status",
  new_status: "New status",
  notes: "Notes",
};

function formatDetailValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-1">
      <span className="min-w-[120px] shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xs break-all">{value}</span>
    </div>
  );
}

function DetailsPanel({ details, action }: { details: AuditLogRecord["details"]; action: string }) {
  const d = parseDetails(details);
  if (!d) {
    return (
      <span className="text-xs text-muted-foreground italic">No additional details recorded.</span>
    );
  }

  const entries = Object.entries(d).filter(
    ([key, v]) =>
      v !== undefined &&
      !(Array.isArray(v) && v.length === 0) &&
      !key.endsWith("_uuid") &&
      !key.endsWith("_id") &&
      key !== "organization_id"
  );

  if (entries.length === 0) {
    return (
      <span className="text-xs text-muted-foreground italic">No additional details recorded.</span>
    );
  }

  return (
    <div className="divide-y divide-border/50 p-4">
      {entries.map(([key, value]) => (
        <DetailRow
          key={key}
          label={DETAIL_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          value={formatDetailValue(key, value)}
        />
      ))}
    </div>
  );
}

/**
 * Turn an audit-log row into one human-readable sentence, e.g.
 * "Hunain Haider promoted john@acme.com to platform user".
 */
function describeEntry(entry: AuditLogRecord, d: Record<string, unknown> | null): string {
  const a = entry.actor_name || "Someone";

  switch (entry.action) {
    case "employee.promote":
      return `${a} promoted ${str(d?.email) || "an employee"} to platform user`;
    case "employee.create":
      return `${a} added employee ${str(d?.full_name) || "—"}${d?.email ? ` (${str(d.email)})` : ""}`;
    case "employee.update":
      return `${a} updated an employee profile${fieldsPart(d)}`;
    case "employee.delete":
      return `${a} deleted an employee record`;

    case "user.create":
      return `${a} created user ${str(d?.email) || "—"}${d?.organization ? ` for organization "${str(d.organization)}"` : ""}`;
    case "user.invite_resend":
      return `${a} resent the invite email to ${str(d?.email) || "a user"}`;
    case "user.invite_cancelled":
      return `${a} cancelled the invitation for ${str(d?.email) || "a user"}`;
    case "user.removed_permanently":
      return `${a} permanently removed ${str(d?.email) || "a user"}`;
    case "user.org_role_update":
      return d?.org_role === "org_admin"
        ? `${a} granted the Org Admin role to a member`
        : `${a} removed the Org Admin role from a user`;
    case "user.update":
      return `${a} updated a user account${fieldsPart(d)}`;
    case "user.delete":
      return `${a} deleted a user account`;

    case "organization.create":
      return `${a} created organization "${str(d?.name) || "—"}"`;
    case "organization.update":
      return `${a} updated an organization${fieldsPart(d)}`;
    case "organization.delete":
      return `${a} deleted an organization`;

    case "subscription.set": {
      const amount = d?.amount !== null && d?.amount !== undefined ? ` ($${str(d.amount)})` : "";
      return `${a} set an organization's subscription to ${str(d?.plan) || "a plan"}${amount}`;
    }
    case "subscription.cancel":
      return `${a} cancelled an organization's subscription`;

    case "payment.create":
      return `${a} recorded a payment of ${str(d?.amount) || "—"}${
        d?.payment_method ? ` via ${str(d.payment_method)}` : ""
      }`;

    case "request.create":
      return `${a} submitted a ${str(d?.document_type) || ""} verification request`.replace(
        "  ",
        " ",
      );
    case "request.update":
      return `${a} updated a verification request`;
    case "request.delete":
      return `${a} deleted a verification request`;
    case "request.lock":
      return `${a} locked a verification request`;
    case "request.unlock":
      return `${a} unlocked a verification request`;
    case "unmatched_org.assign":
      return `${a} matched an unmatched organization record to its organization`;

    case "leave.create":
      return `${a} requested ${str(d?.days) || "?"} day(s) of ${
        str(d?.leave_type) || ""
      } leave (${str(d?.start_date)} → ${str(d?.end_date)})`;

    case "attendance.check_in":
      return `${a} checked in`;
    case "attendance.check_out":
      return `${a} checked out`;
    case "attendance.manual_entry": {
      const time = d?.check_out_time
        ? `${str(d.check_in_time)}–${str(d.check_out_time)}`
        : str(d?.check_in_time);
      return `${a} manually added attendance for ${str(d?.employee_name) || "an employee"} on ${
        str(d?.date) || "—"
      } (${time}): "${str(d?.reason)}"`;
    }
    case "attendance.ip_add":
      return `${a} added ${str(d?.ip) || "an IP"} to the office IP allow-list`;
    case "attendance.ip_remove":
      return `${a} removed ${str(d?.ip) || "an IP"} from the office IP allow-list`;

    case "leave_type.create":
      return `${a} created leave type "${str(d?.name) || "—"}"${
        d?.days ? ` (${str(d.days)} days per year)` : ""
      }`;
    case "leave_type.update":
      return `${a} updated a leave type`;
    case "leave_type.delete":
      return `${a} deleted a leave type`;

    case "salary_record.create":
      return `${a} created a salary record for ${str(d?.month) || "—"}/${str(d?.year) || "—"}${
        d?.net_salary ? ` (net ${str(d.net_salary)})` : ""
      }`;

    case "admin.profile_update":
      return `${a} updated their admin profile${fieldsPart(d)}`;

    case "lead.contact.status_update":
      return `${a} changed contact lead status from "${str(d?.old_status) || "—"}" to "${str(d?.new_status) || "—"}"`;
    case "lead.access_request.status_update":
      return `${a} changed access request "${str(d?.organization_name) || "—"}" status from "${str(d?.old_status) || "—"}" to "${str(d?.new_status) || "—"}"`;

    default:
      return `${a} performed "${actionLabel(entry.action)}"${fieldsPart(d)}`;
  }
}

/** Normalize IPv6-mapped IPv4 (::ffff:1.2.3.4 → 1.2.3.4); loopback ::1 is expected in dev. */
function formatIp(ip?: string) {
  if (!ip) return "—";
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip.trim());
  return mapped ? mapped[1] : ip.trim();
}

const ROLE_LABELS: Record<string, string> = {
  system_admin: "System Admin",
  org_admin: "Org Admin",
  member: "Member",
  unknown: "Unknown",
};

const ROLE_STYLES: Record<string, string> = {
  system_admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  org_admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  member: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  unknown: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
};

function actorBadge(role?: string) {
  const r = role || "unknown";
  return (
    <Badge
      variant="outline"
      className={`rounded-full text-[10px] font-medium ${ROLE_STYLES[r] ?? ROLE_STYLES.unknown}`}
    >
      {ROLE_LABELS[r] ?? r}
    </Badge>
  );
}

function AdminActivityLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [actorType, setActorType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const actions = useQuery({
    queryKey: ["admin-audit-actions"],
    queryFn: () => adminAuditLogService.actions(),
    staleTime: 60_000,
  });

  const list = useQuery({
    queryKey: ["admin-audit-logs", page, search, actionFilter, actorType, dateFrom, dateTo],
    queryFn: () =>
      adminAuditLogService.list({
        page,
        limit: 20,
        search,
        action: actionFilter === "all" ? undefined : actionFilter,
        actor_type: actorType === "all" ? undefined : actorType,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const items = list.data?.items ?? [];

  const toggleRow = (uuid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  return (
    <div>
      <PageHeader
        title="Activity Logs"
        description="Audit trail of meaningful actions across the platform — who did what, when, and from where."
      />

      <Card className="border-border/70 shadow-none">
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder="Search actor, action, entity, IP…"
              />
              <Select
                value={actionFilter}
                onValueChange={(v) => {
                  setActionFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  {(actions.data ?? []).map((a) => (
                    <SelectItem key={a} value={a}>
                      {actionLabel(a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={actorType}
                onValueChange={(v) => {
                  setActorType(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="All roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="user">User</SelectItem>
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
              <EmptyState icon={ScrollText} title="No activity logged yet" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead className="w-full">Activity</TableHead>
                    <TableHead className="whitespace-nowrap">IP Address</TableHead>
                    <TableHead>Date &amp; Time</TableHead>
                    <TableHead className="w-[50px]" aria-label="Toggle details" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((entry, i) => {
                    const details = parseDetails(entry.details);
                    const isOpen = expanded.has(entry.uuid);
                    return (
                      <Fragment key={entry.uuid}>
                        <TableRow>
                          <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                            {(page - 1) * 20 + i + 1}
                          </TableCell>
                          <TableCell data-label="Activity">
                            <div className="flex flex-wrap items-center gap-2 leading-snug">
                              <span>{describeEntry(entry, details)}</span>
                              {actorBadge(entry.actor_role)}
                            </div>
                          </TableCell>
                          <TableCell data-label="IP Address"
                            className="font-mono text-xs text-muted-foreground"
                            title={
                              entry.ip_address === "::1"
                                ? "::1 — localhost (expected in local development)"
                                : undefined
                            }
                          >
                            {formatIp(entry.ip_address)}
                          </TableCell>
                          <TableCell data-label="Date & Time" className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(entry.created_at)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                              onClick={() => toggleRow(entry.uuid)}
                              aria-expanded={isOpen}
                            >
                              {isOpen ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                              {isOpen ? "Hide details" : "View details"}
                            </Button>
                          </TableCell>
                        </TableRow>
                        {isOpen ? (
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="bg-muted/40 p-0">
                              <DetailsPanel details={entry.details} action={entry.action} />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                total={list.data?.total ?? 0}
                totalPages={list.data?.totalPages ?? 1}
                onChange={(p) => {
                  setPage(p);
                  setExpanded(new Set());
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
