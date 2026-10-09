import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  DoorOpen,
  Download,
  MessageSquare,
  Plus,
  Eye,
  History,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  adminLeadsService,
  type ContactLead,
  type AccessRequest,
  type LeadStatusHistory,
} from "@/services";
import { TableSkeleton } from "./_app.requests";
import { formatDateTime, formatDate, apiErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/leads")({
  head: () => ({ meta: [{ title: "Leads —” Dverif Admin" }] }),
  component: AdminLeadsPage,
});

const CONTACT_STATUSES = ["new", "contacted", "closed"] as const;
const ACCESS_STATUSES = ["new", "contacted", "onboarded", "rejected"] as const;

function AdminLeadsPage() {
  return (
    <div>
      <PageHeader
        title="Leads"
        description="Review contact form submissions and access requests from the marketing website."
      />

      <Tabs defaultValue="contact">
        <TabsList className="mb-4 grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
          <TabsTrigger value="contact">
            <MessageSquare className="mr-1.5 h-4 w-4" /> Contact Form
          </TabsTrigger>
          <TabsTrigger value="access">
            <DoorOpen className="mr-1.5 h-4 w-4" /> Access Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contact">
          <ContactLeadsTab />
        </TabsContent>

        <TabsContent value="access">
          <AccessRequestsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* â”€â”€ Status badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  contacted: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  onboarded: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`rounded-full capitalize text-[11px] font-medium ${STATUS_STYLES[status] ?? ""}`}>
      {status}
    </Badge>
  );
}

/* â”€â”€ CSV Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function exportCsv(filename: string, rows: Record<string, unknown>[], headers: string[]) {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* â”€â”€ Contact Leads Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function ContactLeadsTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [detailUuid, setDetailUuid] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ["admin-contact-leads", page, search],
    queryFn: () => adminLeadsService.contactLeads({ page, limit: 20, search }),
  });

  const items = list.data?.items ?? [];

  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search name, email, phone—¦"
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={items.length === 0}
            onClick={() =>
              exportCsv(
                `contact-leads-${Date.now()}.csv`,
                items.map((l) => ({
                  name: l.name,
                  email: l.email,
                  phone: l.phone ?? "",
                  message: l.message ?? "",
                  status: l.status,
                  latest_note: l.latest_note ?? "",
                  date: l.created_at,
                })),
                ["name", "email", "phone", "message", "status", "latest_note", "date"]
              )
            }
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
        {list.isLoading ? (
          <TableSkeleton />
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={MessageSquare} title="No contact submissions yet" />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">S.No</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latest Note</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((lead, i) => (
                  <ContactLeadRow
                    key={lead.uuid}
                    serial={(page - 1) * 20 + i + 1}
                    lead={lead}
                    onViewDetail={() => setDetailUuid(lead.uuid)}
                  />
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

      {detailUuid && (
        <ContactLeadDetailDialog
          uuid={detailUuid}
          open={!!detailUuid}
          onOpenChange={(o) => { if (!o) setDetailUuid(null); }}
        />
      )}
    </Card>
  );
}

function ContactLeadRow({
  serial,
  lead,
  onViewDetail,
}: {
  serial: number;
  lead: ContactLead;
  onViewDetail: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [statusDraft, setStatusDraft] = useState<string>(lead.status);
  const [notesDraft, setNotesDraft] = useState("");
  const queryClient = useQueryClient();

  const updateMut = useMutation({
    mutationFn: (data: { status: string; notes?: string }) =>
      adminLeadsService.updateContactLeadStatus(lead.uuid, data),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-contact-leads"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sidebar-counts"] });
      setExpanded(false);
      setNotesDraft("");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Update failed")),
  });

  return (
    <Fragment>
      <TableRow className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <TableCell data-label="S.No" className="w-10 text-muted-foreground">{serial}</TableCell>
        <TableCell data-label="Name" className="font-medium">{lead.name}</TableCell>
        <TableCell data-label="Email" className="text-muted-foreground">{lead.email}</TableCell>
        <TableCell data-label="Phone" className="text-muted-foreground">{lead.phone ?? "—”"}</TableCell>
        <TableCell data-label="Message" className="max-w-xs truncate text-muted-foreground">
          {lead.message ?? "—”"}
        </TableCell>
        <TableCell data-label="Status" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={lead.status} />
        </TableCell>
        <TableCell data-label="Latest Note" className="max-w-[200px] truncate text-xs text-muted-foreground">
          {lead.latest_note ?? "—”"}
        </TableCell>
        <TableCell data-label="Date" className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(lead.created_at)}
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5"
              onClick={(e) => { e.stopPropagation(); onViewDetail(); }}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-1.5 text-xs text-muted-foreground"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={9} className="bg-muted/40 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="flex-1 space-y-2">
                <Label className="text-xs font-medium">Update Status</Label>
                <div className="flex gap-2">
                  <Select value={statusDraft} onValueChange={setStatusDraft}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTACT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={statusDraft === lead.status && !notesDraft.trim()}
                    onClick={() =>
                      updateMut.mutate({
                        status: statusDraft,
                        ...(notesDraft.trim() ? { notes: notesDraft.trim() } : {}),
                      })
                    }
                  >
                    Save
                  </Button>
                </div>
                <Textarea
                  placeholder="Add a note (optional)—¦"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={2}
                  className="mt-1 text-sm"
                />
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

function ContactLeadDetailDialog({
  uuid,
  open,
  onOpenChange,
}: {
  uuid: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const detail = useQuery({
    queryKey: ["admin-contact-lead-detail", uuid],
    queryFn: () => adminLeadsService.getContactLead(uuid),
    enabled: open,
  });

  const lead = detail.data?.lead;
  const history = detail.data?.history ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Contact Lead Details</DialogTitle>
          <DialogDescription>Full submission and status history</DialogDescription>
        </DialogHeader>
        {detail.isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading—¦</div>
        ) : lead ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DetailField label="Name" value={lead.name} />
              <DetailField label="Email" value={lead.email} />
              <DetailField label="Phone" value={lead.phone} />
              <DetailField label="Status">
                <StatusBadge status={lead.status} />
              </DetailField>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Message</Label>
              <p className="mt-1 whitespace-pre-wrap text-sm">{lead.message || "—”"}</p>
            </div>
            {history.length > 0 && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <History className="h-3 w-3" /> Status History
                </Label>
                <div className="mt-2 space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="rounded-md border p-2 text-xs">
                      <div className="flex items-center gap-2">
                        {h.old_status && (
                          <>
                            <StatusBadge status={h.old_status} />
                            <span>â†’</span>
                          </>
                        )}
                        <StatusBadge status={h.new_status} />
                        <span className="text-muted-foreground">by {h.changed_by_name ?? "System"}</span>
                        <span className="ml-auto text-muted-foreground">{formatDateTime(h.created_at)}</span>
                      </div>
                      {h.notes && (
                        <p className="mt-1 text-muted-foreground italic">{h.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* â”€â”€ Access Requests Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function AccessRequestsTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [detailUuid, setDetailUuid] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["admin-access-requests", page, search],
    queryFn: () => adminLeadsService.accessRequests({ page, limit: 20, search }),
  });

  const items = list.data?.items ?? [];

  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search organization, contact, email—¦"
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={items.length === 0}
            onClick={() =>
              exportCsv(
                `access-requests-${Date.now()}.csv`,
                items.map((r) => ({
                  organization_name: r.organization_name,
                  contact_name: r.contact_name,
                  email: r.email,
                  phone: r.phone ?? "",
                  company_size: r.company_size ?? "",
                  message: r.message ?? "",
                  status: r.status,
                  latest_note: r.latest_note ?? "",
                  date: r.created_at,
                })),
                ["organization_name", "contact_name", "email", "phone", "company_size", "message", "status", "latest_note", "date"]
              )
            }
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
        {list.isLoading ? (
          <TableSkeleton />
        ) : items.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={DoorOpen} title="No access requests yet" />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">S.No</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Company Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latest Note</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((req, i) => (
                  <AccessRequestRow
                    key={req.uuid}
                    serial={(page - 1) * 20 + i + 1}
                    request={req}
                    onViewDetail={() => setDetailUuid(req.uuid)}
                  />
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

      {detailUuid && (
        <AccessRequestDetailDialog
          uuid={detailUuid}
          open={!!detailUuid}
          onOpenChange={(o) => { if (!o) setDetailUuid(null); }}
        />
      )}
    </Card>
  );
}

function AccessRequestRow({
  serial,
  request: req,
  onViewDetail,
}: {
  serial: number;
  request: AccessRequest;
  onViewDetail: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [statusDraft, setStatusDraft] = useState<string>(req.status);
  const [notesDraft, setNotesDraft] = useState("");
  const [showOrgDialog, setShowOrgDialog] = useState(false);
  const queryClient = useQueryClient();

  const updateMut = useMutation({
    mutationFn: (data: { status: string; notes?: string }) =>
      adminLeadsService.updateAccessRequestStatus(req.uuid, data),
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sidebar-counts"] });
      setExpanded(false);
      setNotesDraft("");
    },
    onError: (e) => toast.error(apiErrorMessage(e, "Update failed")),
  });

  return (
    <Fragment>
      <TableRow className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <TableCell data-label="S.No" className="w-10 text-muted-foreground">{serial}</TableCell>
        <TableCell data-label="Organization" className="font-medium">{req.organization_name}</TableCell>
        <TableCell data-label="Contact" className="text-muted-foreground">{req.contact_name}</TableCell>
        <TableCell data-label="Email" className="text-muted-foreground">{req.email}</TableCell>
        <TableCell data-label="Phone" className="text-muted-foreground">{req.phone ?? "—”"}</TableCell>
        <TableCell data-label="Company Size" className="text-muted-foreground">{req.company_size ?? "—”"}</TableCell>
        <TableCell data-label="Status" onClick={(e) => e.stopPropagation()}>
          <StatusBadge status={req.status} />
        </TableCell>
        <TableCell data-label="Latest Note" className="max-w-[200px] truncate text-xs text-muted-foreground">
          {req.latest_note ?? "—”"}
        </TableCell>
        <TableCell data-label="Date" className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(req.created_at)}
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1.5"
              onClick={(e) => { e.stopPropagation(); onViewDetail(); }}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-1.5 text-xs text-muted-foreground"
              onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={10} className="bg-muted/40 p-4">
            <div className="flex flex-col gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Update Status</Label>
                <div className="flex gap-2">
                  <Select value={statusDraft} onValueChange={setStatusDraft}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCESS_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={statusDraft === req.status && !notesDraft.trim()}
                    onClick={() =>
                      updateMut.mutate({
                        status: statusDraft,
                        ...(notesDraft.trim() ? { notes: notesDraft.trim() } : {}),
                      })
                    }
                  >
                    Save
                  </Button>
                </div>
                <Textarea
                  placeholder="Add a note (optional)—¦"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>
              {req.status === "onboarded" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit gap-1.5"
                  onClick={(e) => { e.stopPropagation(); setShowOrgDialog(true); }}
                >
                  <Plus className="h-3.5 w-3.5" /> Create Organization
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
      {showOrgDialog && (
        <CreateOrgFromLeadDialog
          request={req}
          open={showOrgDialog}
          onOpenChange={(o) => setShowOrgDialog(o)}
        />
      )}
    </Fragment>
  );
}

function AccessRequestDetailDialog({
  uuid,
  open,
  onOpenChange,
}: {
  uuid: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const detail = useQuery({
    queryKey: ["admin-access-request-detail", uuid],
    queryFn: () => adminLeadsService.getAccessRequest(uuid),
    enabled: open,
  });

  const request = detail.data?.request;
  const history = detail.data?.history ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Access Request Details</DialogTitle>
          <DialogDescription>Full submission and status history</DialogDescription>
        </DialogHeader>
        {detail.isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading—¦</div>
        ) : request ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <DetailField label="Organization" value={request.organization_name} />
              <DetailField label="Contact" value={request.contact_name} />
              <DetailField label="Email" value={request.email} />
              <DetailField label="Phone" value={request.phone} />
              <DetailField label="Company Size" value={request.company_size} />
              <DetailField label="Status">
                <StatusBadge status={request.status} />
              </DetailField>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Message</Label>
              <p className="mt-1 whitespace-pre-wrap text-sm">{request.message || "—”"}</p>
            </div>
            {history.length > 0 && (
              <div>
                <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <History className="h-3 w-3" /> Status History
                </Label>
                <div className="mt-2 space-y-2">
                  {history.map((h) => (
                    <div key={h.id} className="rounded-md border p-2 text-xs">
                      <div className="flex items-center gap-2">
                        {h.old_status && (
                          <>
                            <StatusBadge status={h.old_status} />
                            <span>â†’</span>
                          </>
                        )}
                        <StatusBadge status={h.new_status} />
                        <span className="text-muted-foreground">by {h.changed_by_name ?? "System"}</span>
                        <span className="ml-auto text-muted-foreground">{formatDateTime(h.created_at)}</span>
                      </div>
                      {h.notes && (
                        <p className="mt-1 text-muted-foreground italic">{h.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* â”€â”€ Create Organization from Access Request â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function CreateOrgFromLeadDialog({
  request: req,
  open,
  onOpenChange,
}: {
  request: AccessRequest;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [name, setName] = useState(req.organization_name);
  const [type, setType] = useState("software_house");
  const [businessEmail, setBusinessEmail] = useState(req.email);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const submit = async () => {
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("organization_type", type);
      form.append("business_email", businessEmail.trim());
      const { adminService } = await import("@/services");
      await adminService.createOrganization(form);
      toast.success("Organization created from access request");
      queryClient.invalidateQueries({ queryKey: ["admin-orgs"] });
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(apiErrorMessage(e, "Failed to create organization"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>
            Pre-filled from the access request. Adjust as needed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Organization Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="education">Education</SelectItem>
                <SelectItem value="government">Government</SelectItem>
                <SelectItem value="software_house">Software House</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Business Email</Label>
            <Input value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name.trim() || submitting}>
            {submitting ? "Creating—¦" : "Create Organization"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* â”€â”€ Shared helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function DetailField({ label, value, children }: { label: string; value?: string | null; children?: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-0.5 text-sm">{children ?? value ?? "—”"}</div>
    </div>
  );
}

/* â”€â”€ Inline Tabs (avoid importing external tabs lib) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
