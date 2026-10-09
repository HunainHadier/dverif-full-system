import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Eye, XCircle, Lock, Unlock } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ProtectedDocumentLink } from "@/components/common/ProtectedDocumentLink";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "./_app.requests";
import { adminService, type UnmatchedOrganization, type UnmatchedOrgDetail } from "@/services";
import { formatDate, formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/null-requests")({
  head: () => ({ meta: [{ title: "Unmatched Organizations — Dverif Admin" }] }),
  component: NullRequestsPage,
});

const PAGE_SIZE = 20;

const statusStyles: Record<string, string> = {
  pending: "bg-warning/15 text-warning-foreground border-warning/30",
  contacted: "bg-primary/10 text-primary border-primary/20",
  converted: "bg-success/12 text-success border-success/25",
  ignored: "bg-muted text-muted-foreground border-border",
};

function formatWebsiteUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function NullRequestsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const q = useQuery({
    queryKey: ["null-org-requests", page, search, dateFrom, dateTo],
    queryFn: () =>
      adminService.nullOrgRequests({ page, limit: PAGE_SIZE, search, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
  });

  const items = q.data?.items ?? [];
  const totalPages = q.data?.totalPages ?? 1;

  const [detailUuid, setDetailUuid] = useState<string | null>(null);
  const [assignOrg, setAssignOrg] = useState<UnmatchedOrganization | null>(null);

  return (
    <div>
      <PageHeader
        title="Unmatched organizations"
        description="Organizations referenced in requests but not yet in the network. Assign them to a verified org or mark as handled."
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
              placeholder="Search by organization name, email, or phone…"
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
          </div>

          {q.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={CheckCircle2}
                title="Nothing to review"
                description="Every submitted request is already matched to a verified organization."
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
                      <TableHead className="whitespace-nowrap">Email</TableHead>
                      <TableHead className="whitespace-nowrap">Phone</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead className="whitespace-nowrap">First seen</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((org, i) => (
                      <TableRow key={org.uuid}>
                        <TableCell data-label="S.No" className="w-10 text-muted-foreground">
                          {(page - 1) * 20 + i + 1}
                        </TableCell>
                        <TableCell data-label="Organization" className="font-medium text-foreground whitespace-nowrap">
                          {org.name}
                        </TableCell>
                        <TableCell data-label="Email" className="text-muted-foreground whitespace-nowrap">
                          {org.email ?? "—"}
                        </TableCell>
                        <TableCell data-label="Phone" className="text-muted-foreground whitespace-nowrap">
                          {org.phone ?? "—"}
                        </TableCell>
                        <TableCell data-label="Status" className="whitespace-nowrap">
                          <Badge
                            variant="outline"
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyles[org.status] ?? statusStyles.pending}`}
                          >
                            {org.status}
                          </Badge>
                        </TableCell>
                        <TableCell data-label="First seen" className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(org.created_at)}
                        </TableCell>
                        <TableCell data-label="Actions" className="text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setDetailUuid(org.uuid)}
                            >
                              <Eye className="mr-1 h-3 w-3" /> Details
                            </Button>
                            {org.status === "pending" && (
                              <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setAssignOrg(org)}
                              >
                                Accept & assign
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={page}
                total={q.data?.total ?? 0}
                totalPages={totalPages}
                onChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <UnmatchedOrgDetailDialog
        uuid={detailUuid}
        onClose={() => setDetailUuid(null)}
        onAssign={(org) => {
          setDetailUuid(null);
          setAssignOrg(org);
        }}
      />
      <AssignDialog unmatchedOrg={assignOrg} onClose={() => setAssignOrg(null)} />
    </div>
  );
}

function UnmatchedOrgDetailDialog({
  uuid,
  onClose,
  onAssign,
}: {
  uuid: string | null;
  onClose: () => void;
  onAssign: (org: UnmatchedOrganization) => void;
}) {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ["null-org-detail", uuid],
    queryFn: () => adminService.unmatchedOrgDetail(uuid!),
    enabled: !!uuid,
  });

  const org = detail.data?.organization;
  const requests = detail.data?.requests ?? [];

  const [reviewing, setReviewing] = useState<UnmatchedOrgDetail["requests"][number] | null>(null);
  const [remarks, setRemarks] = useState("");

  const lockMut = useMutation({
    mutationFn: (reqUuid: string) => adminService.lockRequest(reqUuid),
    onSuccess: () => {
      toast.success("Request locked");
      qc.invalidateQueries({ queryKey: ["null-org-detail", uuid] });
      qc.invalidateQueries({ queryKey: ["myRequests"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to lock"),
  });

  const unlockMut = useMutation({
    mutationFn: (reqUuid: string) => adminService.unlockRequest(reqUuid),
    onSuccess: () => {
      toast.success("Request unlocked");
      qc.invalidateQueries({ queryKey: ["null-org-detail", uuid] });
      qc.invalidateQueries({ queryKey: ["myRequests"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to unlock"),
  });

  const verify = useMutation({
    mutationFn: ({ reqUuid, status }: { reqUuid: string; status: "verified" | "unverified" }) =>
      adminService.adminVerifyUnmatchedRequest(reqUuid, { status, verification_remarks: remarks }),
    onSuccess: () => {
      toast.success("Request updated");
      qc.invalidateQueries({ queryKey: ["null-org-detail", uuid] });
      qc.invalidateQueries({ queryKey: ["null-org-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-sidebar-counts"] });
      setReviewing(null);
      setRemarks("");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed"),
  });

  return (
    <Dialog open={!!uuid} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Unmatched organization details</DialogTitle>
          <DialogDescription>
            All information and linked requests for this unmatched organization.
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-5 w-40" />
          </div>
        ) : org ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-border">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="w-40 font-medium text-muted-foreground">Name</TableCell>
                    <TableCell className="font-medium text-foreground">{org.name}</TableCell>
                  </TableRow>
                  {org.email && (
                    <TableRow>
                      <TableCell className="font-medium text-muted-foreground">Email</TableCell>
                      <TableCell className="break-words text-foreground">{org.email}</TableCell>
                    </TableRow>
                  )}
                  {org.phone && (
                    <TableRow>
                      <TableCell className="font-medium text-muted-foreground">Phone</TableCell>
                      <TableCell className="break-words text-foreground">{org.phone}</TableCell>
                    </TableRow>
                  )}
                  {org.website && (
                    <TableRow>
                      <TableCell className="font-medium text-muted-foreground">Website</TableCell>
                      <TableCell>
                        <a
                          href={formatWebsiteUrl(org.website)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1 break-all text-foreground underline underline-offset-2 hover:text-primary"
                        >
                          {org.website} <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">Status</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusStyles[org.status] ?? statusStyles.pending}`}
                      >
                        {org.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  {org.assigned_organization && (
                    <TableRow>
                      <TableCell className="font-medium text-muted-foreground">
                        Assigned to
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {org.assigned_organization.name}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell className="font-medium text-muted-foreground">Request Generated</TableCell>
                    <TableCell className="text-foreground">{formatDate(org.created_at)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {requests.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-foreground">
                  Linked requests ({requests.length})
                </h4>
                <div className="rounded-lg border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">S.No</TableHead>
                        <TableHead className="whitespace-nowrap">Requester</TableHead>
                        <TableHead className="whitespace-nowrap">Document</TableHead>
                        <TableHead className="whitespace-nowrap">Status</TableHead>
                        <TableHead className="whitespace-nowrap">Locked</TableHead>

                        <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((r, i) => {
                        const isLocked = !!r.locked_by;
                        return (
                          <TableRow key={r.uuid}>
                            <TableCell data-label="S.No" className="w-10 text-muted-foreground">{i + 1}</TableCell>
                            <TableCell data-label="Requester" className="whitespace-nowrap">
                              <div className="text-sm font-medium text-foreground">{r.requester_name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">{r.requester_email ?? ""}</div>
                            </TableCell>
                            <TableCell data-label="Document" className="text-sm text-muted-foreground whitespace-nowrap">{r.document_type}</TableCell>
                            <TableCell data-label="Status" className="whitespace-nowrap"><StatusBadge status={r.status} /></TableCell>
                            <TableCell data-label="Locked" className="whitespace-nowrap">
                              {isLocked ? (
                                <span className="inline-flex items-center gap-1 text-xs text-warning-foreground">
                                  <Lock className="h-3 w-3" /> {r.locked_by_name ?? "Locked"}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          
                            <TableCell data-label="Actions" className="text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                {r.document_path && (
                                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground" asChild>
                                    <ProtectedDocumentLink storedPath={r.document_path}>
                                      <ExternalLink className="h-4 w-4" />
                                    </ProtectedDocumentLink>
                                  </Button>
                                )}
                                {r.status === "under_review" && (
                                  <>
                                    {isLocked ? (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 shrink-0 text-warning-foreground hover:text-warning"
                                        title="Unlock request"
                                        onClick={() => unlockMut.mutate(r.uuid)}
                                        disabled={unlockMut.isPending}
                                      >
                                        <Unlock className="h-4 w-4" />
                                      </Button>
                                    ) : (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                                        title="Lock request"
                                        onClick={() => lockMut.mutate(r.uuid)}
                                        disabled={lockMut.isPending}
                                      >
                                        <Lock className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 shrink-0 text-xs"
                                      onClick={() => { setReviewing(r); setRemarks(""); }}
                                    >
                                      <Eye className="mr-1 h-3 w-3" /> Review
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {org?.status === "pending" && (
            <Button onClick={() => onAssign(org)}>
              Accept & assign
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Inline review dialog for unmatched requests */}
      <Dialog open={!!reviewing} onOpenChange={(o) => { if (!o) { setReviewing(null); setRemarks(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Review request</DialogTitle>
            <DialogDescription>
              Approve or reject this document submitted against an unmatched organization.
            </DialogDescription>
          </DialogHeader>
          {reviewing && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <div className="font-medium text-foreground">{reviewing.document_type}</div>
                <div className="text-xs text-muted-foreground">
                  by {reviewing.requester_name ?? "—"} · {formatDateTime(reviewing.submitted_at)}
                </div>
              </div>
              {reviewing.submission_remarks && (
                <div>
                  <Label>Requester's remarks</Label>
                  <div className="mt-1 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                    {reviewing.submission_remarks}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="admin-remarks">Your verification remarks</Label>
                <Textarea
                  id="admin-remarks"
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Reason for your decision…"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setReviewing(null); setRemarks(""); }} disabled={verify.isPending}>
              Cancel
            </Button>
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => reviewing && verify.mutate({ reqUuid: reviewing.uuid, status: "unverified" })}
              disabled={verify.isPending}
            >
              <XCircle className="mr-2 h-4 w-4" /> Reject
            </Button>
            <Button
              onClick={() => reviewing && verify.mutate({ reqUuid: reviewing.uuid, status: "verified" })}
              disabled={verify.isPending}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function AssignDialog({
  unmatchedOrg,
  onClose,
}: {
  unmatchedOrg: UnmatchedOrganization | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const orgs = useQuery({
    queryKey: ["admin-orgs-lookup"],
    queryFn: () => adminService.organizations({ page: 1, limit: 100 }),
    enabled: !!unmatchedOrg,
  });
  const detail = useQuery({
    queryKey: ["null-org-detail", unmatchedOrg?.uuid],
    queryFn: () => adminService.unmatchedOrgDetail(unmatchedOrg!.uuid),
    enabled: !!unmatchedOrg,
  });
  const [orgUuid, setOrgUuid] = useState<string>("");
  const [remarks, setRemarks] = useState("");

  const excludeOrgUuids = useMemo(
    () =>
      Array.from(
        new Set(
          (detail.data?.requests ?? [])
            .map((r) => r.requester_org_uuid)
            .filter((id): id is string => !!id),
        ),
      ),
    [detail.data],
  );

  const availableOrgs = useMemo(
    () => (orgs.data?.items ?? []).filter((o) => !excludeOrgUuids.includes(o.uuid)),
    [orgs.data, excludeOrgUuids],
  );

  const accept = useMutation({
    mutationFn: () =>
      adminService.acceptRequest(unmatchedOrg!.uuid, {
        verification_remarks: remarks,
        issuing_organization_uuid: orgUuid,
      }),
    onSuccess: () => {
      toast.success("Organization assigned and requests routed");
      qc.invalidateQueries({ queryKey: ["null-org-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-sidebar-counts"] });
      qc.invalidateQueries({ queryKey: ["null-org-detail"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed"),
  });

  return (
    <Dialog open={!!unmatchedOrg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign organization</DialogTitle>
          <DialogDescription>
            Route requests from{" "}
            <span className="font-medium text-foreground">
              "{unmatchedOrg?.name}"
            </span>{" "}
            to an existing verified organization.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Organization</Label>
            <SearchableSelect
              items={availableOrgs.map((o) => ({ value: o.uuid, label: o.name }))}
              value={orgUuid}
              onChange={setOrgUuid}
              placeholder="Select organization"
              searchPlaceholder="Search organization…"
              emptyText="No eligible organizations found."
            />
            {excludeOrgUuids.length > 0 && (
              <p className="text-xs text-muted-foreground">
                The requesting organization is excluded from the list.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Verification remarks</Label>
            <Textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Note for the requester and/or the receiving org…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={accept.isPending}>
            Cancel
          </Button>
          <Button onClick={() => accept.mutate()} disabled={accept.isPending || !orgUuid}>
            Accept & assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
