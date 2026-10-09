import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  FileText,
  Plus,
  // Trash2,
  UploadCloud,
  FileCheck2,
  Pencil,
  ExternalLink,
  Eye,
  Building2,
  Activity,
  Gauge,
  ChartColumnIncreasing,
  TriangleAlert,
} from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { usePermissions } from "@/lib/permissions";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { RequestDetailModal } from "@/components/common/RequestDetailModal";
import { RequestSubmittedModal } from "@/components/common/RequestSubmittedModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  requestsService,
  orgSubscriptionService,
  isVerifiedRequestStatus,
  type VerificationRequest,
  type UUID,
} from "@/services";
import { digitsOnly, formatCNIC, formatDate, parseFeatureAccess } from "@/lib/utils";
import { UPLOADABLE_DOC_ACCEPT, validateUploadableFile } from "@/lib/documentTypes";
import { useDocumentTypes } from "@/lib/useDocumentTypes";
import { authStore, useAuth } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { DverifLoader } from "@/components/common/DvarifLoader";
import { ProtectedDocumentLink } from "@/components/common/ProtectedDocumentLink";

export const Route = createFileRoute("/_app/requests")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Deliberately the same call the sidebar makes when deciding whether to
    // render this page's link -- one table, so a visible link and a reachable
    // page cannot disagree. See lib/routeAccess.
    if (!canAccessRoute(authStore.get().user, "/requests")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "My Requests — Dverif" }] }),
  component: RequestsPage,
});

function RequestsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<VerificationRequest | null>(null);
  const [toDelete, setToDelete] = useState<UUID | null>(null);
  const [viewing, setViewing] = useState<VerificationRequest | null>(null);
  const perms = usePermissions();
  const canGenerate = perms.generate_request;

  const list = useQuery({
    queryKey: ["myRequests", page, search, dateFrom, dateTo],
    queryFn: () =>
      requestsService.mySent({
        page,
        limit: 10,
        search,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const quota = useQuery({
    queryKey: ["quota-status"],
    queryFn: () => orgSubscriptionService.quota(),
    enabled: !!user && user.role !== "admin",
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const quotaData = quota.data;
  const hasPaidPlan = Number(quotaData?.plan_quota ?? 0) > 0;

  // Always use the pre-combined totals from quota_status — these already
  // account for both the free daily request AND the paid plan quota, so the
  // ring shows the true picture regardless of plan type.
  const usedToday = Number(quotaData?.total_requests ?? 0);
  const dailyQuota = Math.max(1, Number(quotaData?.total_allowance ?? 1));
  const quotaExhausted = quota.isFetched && usedToday >= dailyQuota;
  const quotaLabel = hasPaidPlan
    ? quotaData?.plan?.name ?? t("requests.quota.planTitle", "Plan quota")
    : t("requests.quota.freeTier", "Free tier");
  const del = useMutation({
    mutationFn: (uuid: UUID) => requestsService.deleteSent(uuid),
    onSuccess: () => {
      toast.success(t("requests.requestDeleted"));
      qc.invalidateQueries({ queryKey: ["myRequests"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("requests.deleteFailed")),
  });

  const items = list.data?.items ?? [];
  const totalPages = list.data?.totalPages ?? 1;
  const total = list.data?.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        className="sm:items-end"
        title={t("requests.title")}
        description={
          hasPaidPlan
            ? t("requests.description")
            : t(
              "requests.freeTierDescription",
              "Your organization does not have an active subscription right now, but one free verification request is still available each day.",
            )
        }
        actions={
          <Button
            onClick={() => setOpenCreate(true)}
            disabled={!canGenerate || quotaExhausted}
            title={
              quotaExhausted
                ? t("requests.quota.exhausted")
                : undefined
            }
          >
            <Plus className="mr-2 h-4 w-4" /> {t("requests.newRequest")}
          </Button>
        }
      />

      <QuotaSummary
        usedToday={usedToday}
        dailyQuota={dailyQuota}
        remaining={Math.max(0, dailyQuota - usedToday)}
        label={quotaLabel}
        planName={quotaData?.plan?.name}
        exhausted={quotaExhausted}
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
              placeholder={t("requests.searchPlaceholder", "Search by document or organization…")}
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
              />
              <span className="text-xs text-muted-foreground max-sm:px-1">{t("requests.dateTo", "to")}</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:w-40"
              />
            </div>
          </div>

          {list.isLoading ? (
            <TableSkeleton />
          ) : items.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={FileText}
                title={t("requests.noRequestsYet")}
                description={
                  hasPaidPlan
                    ? t("requests.emptyDescription")
                    : t(
                      "requests.freeTierEmptyDesc",
                      "Your free daily request is still available. Submit one verification request to get started.",
                    )
                }
                action={
                  <Button
                    onClick={() => setOpenCreate(true)}
                    disabled={!canGenerate || quotaExhausted}
                  >
                    <Plus className="mr-2 h-4 w-4" /> {t("requests.newRequest")}
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead>{t("requests.table.docType")}</TableHead>
                    <TableHead>{t("requests.table.organization")}</TableHead>
                    <TableHead>{t("requests.table.status")}</TableHead>
                    <TableHead>{t("requests.table.submitted")}</TableHead>
                    <TableHead>{t("requests.table.verifiedDate")}</TableHead>
                    <TableHead>{t("requests.table.format")}</TableHead>
                    <TableHead className="text-right">{t("requests.table.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r, i) => (
                    <TableRow key={r.uuid}>
                      <TableCell className="w-10 text-muted-foreground">
                        {(page - 1) * 10 + i + 1}
                      </TableCell>
                      <TableCell data-label={t("requests.table.docType")} className="font-medium text-foreground">
                        {r.document_type}
                      </TableCell>
                      <TableCell data-label={t("requests.table.organization")} className="text-muted-foreground">
                        {r.issuing_org_name ?? (
                          <span className="italic">{r.unmatched_org_name ?? "—"} {t("requests.table.unmatched")}</span>
                        )}
                      </TableCell>
                      <TableCell data-label={t("requests.table.status")}>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell data-label={t("requests.table.submitted")} className="text-xs text-muted-foreground">
                        {formatDate(r.submitted_at)}
                      </TableCell>
                      <TableCell
                        data-label={t("requests.table.verifiedDate")}
                        className="text-xs text-muted-foreground"
                      >
                        {r.status === "under_review" ? "—" : formatDate(r.verified_at)}
                      </TableCell>
                      <TableCell
                        data-label={t("requests.table.format")}
                        className="text-xs uppercase text-muted-foreground"
                      >
                        {r.document_format ?? "PDF"}
                      </TableCell>
                      <TableCell data-label={t("requests.table.actions")} className="mobile-actions-cell text-right">
                        <div className="flex flex-wrap items-center justify-start gap-1 sm:justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => setViewing(r)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {r.status === "under_review" && !r.locked_by && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => setEditing(r)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {/*
                            TODO: re-enable delete for org admins when allowed.
                            Currently org admins cannot delete requests.
                          {!isVerifiedRequestStatus(r.status) && !r.locked_by && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setToDelete(r.uuid)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          */}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <CreateRequestDialog
        open={openCreate}
        onOpenChange={setOpenCreate}
        onCreated={async () => {
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["myRequests"] }),
            qc.invalidateQueries({ queryKey: ["quota-status"] }),
          ]);
          setOpenCreate(false);
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("requests.deleteTitle")}
        description={t("requests.deleteDesc")}
        onConfirm={() => {
          if (toDelete) del.mutate(toDelete);
          setToDelete(null);
        }}
      />

      <EditRequestDialog
        request={editing}
        onOpenChange={() => setEditing(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["myRequests"] });
          setEditing(null);
        }}
      />

      <RequestDetailModal request={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
function QuotaSummary({
  usedToday,
  dailyQuota,
  remaining,
  label,
  planName,
  exhausted,
}: {
  usedToday: number;
  dailyQuota: number;
  remaining: number;
  label: string;
  planName?: string | null;
  exhausted: boolean;
}) {
  const { t } = useTranslation();
  const percent =
    dailyQuota > 0 ? Math.min(100, Math.round((usedToday / dailyQuota) * 100)) : 0;

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard
        icon={Gauge}
        title={t("requests.quota.summaryTitle", "Daily usage")}
        value={
          <span className="tabular-nums">
            {t("requests.quota.usedWithLimit", "used of total", {
              used: usedToday,
              total: dailyQuota,
            })}
          </span>
        }
        hint={t("requests.quota.usageDesc", "verification requests used today")}
        tone={exhausted ? "muted" : "accent"}
      >
        <ProgressBar percent={percent} exhausted={exhausted} />
      </StatCard>



      <StatCard
        icon={Activity}
        title={t("requests.quota.today", "Requests today")}
        value={<span className="tabular-nums">{usedToday}</span>}
        hint={
          exhausted
            ? t("requests.quota.exhausted")
            : `${remaining} ${t("requests.quota.remaining", "remaining")}`
        }
        tone={exhausted ? "muted" : "default"}
      >

      </StatCard>
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
  hint,
  tone = "default",
  children,
}: {
  icon: React.ElementType;
  title: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "accent" | "muted";
  children?: ReactNode;
}) {
  return (
    <Card className="border-border/70 shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone === "accent"
              ? "bg-primary/10 text-primary"
              : tone === "muted"
                ? "bg-muted text-muted-foreground"
                : "bg-muted/40 text-foreground"
              }`}
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-base font-semibold text-foreground">{value}</p>
            {hint ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{hint}</p>
            ) : null}
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function ProgressBar({ percent, exhausted }: { percent: number; exhausted: boolean }) {
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full ${exhausted ? "bg-destructive/80" : "bg-primary/70"}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function TableSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 py-14"
    >
      <DverifLoader size="md" />
      <p className="text-sm text-muted-foreground">{t("requests.loading")}</p>
    </div>
  );
}

function CreateRequestDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const orgs = useQuery({
    queryKey: ["orgs-for-request"],
    queryFn: () => requestsService.organizations(),
    enabled: open,
  });

  // The document-type catalogue is API-driven (a system admin can add types), so
  // a type added in the admin panel is selectable here without a frontend deploy.
  // The built-in list stands in if the request fails, so this form can never be
  // emptied out and block submissions entirely.
  const { items: documentTypeOptions } = useDocumentTypes();

  const [documentType, setDocumentType] = useState("");
  const [orgUuid, setOrgUuid] = useState<string>("");
  const [otherOrgName, setOtherOrgName] = useState("");
  const [otherOrgEmail, setOtherOrgEmail] = useState("");
  const [otherOrgPhone, setOtherOrgPhone] = useState("");
  const [otherOrgWebsite, setOtherOrgWebsite] = useState("");
  const [remarks, setRemarks] = useState("");
  const [documentOwnerCnic, setDocumentOwnerCnic] = useState("");
  const [documentOwnerName, setDocumentOwnerName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<VerificationRequest | null>(null);

  const isOther = orgUuid === "__other__";

  const orgOptions = useMemo(() => orgs.data ?? [], [orgs.data]);

  const submit = async () => {
    if (!documentType.trim()) return toast.error(t("requests.docTypeRequired"));
    if (!file) return toast.error(t("requests.attachDocument"));
    // Check the file against the same allow-list the server enforces, so an
    // unsupported type or an oversized file fails immediately with a clear
    // message instead of after a full upload that the server will reject.
    const fileProblem = validateUploadableFile(file);
    if (fileProblem) {
      toast.error(fileProblem.message);
      return;
    }
    if (!orgUuid) return toast.error(t("requests.selectIssuingOrg"));
    if (isOther && !otherOrgName.trim()) return toast.error(t("requests.enterOrgName"));
    if (otherOrgEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otherOrgEmail))
      return toast.error(t("requests.validEmail"));
    if (!documentOwnerName.trim()) return toast.error(t("requests.ownerNameRequired"));
    if (!/^\d{13}$/.test(digitsOnly(documentOwnerCnic)))
      return toast.error(t("requests.validCnic"));
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("document_type", documentType);
      form.append("submission_remarks", remarks);
      form.append("document", file);
      form.append("document_owner_name", documentOwnerName.trim());
      form.append("document_owner_cnic", digitsOnly(documentOwnerCnic));
      if (isOther) {
        form.append("issuing_organization_uuid", "");
        form.append("other_organization_name", otherOrgName);
        if (otherOrgEmail) form.append("other_organization_email", otherOrgEmail);
        if (otherOrgPhone) form.append("other_organization_phone", otherOrgPhone);
        if (otherOrgWebsite) form.append("other_organization_website", otherOrgWebsite);
      } else {
        form.append("issuing_organization_uuid", orgUuid);
      }
      const created = await requestsService.create(form);
      // The success modal is the only feedback here — no toast, so the animated
      // check mark is the single confirmation the user sees. It carries the
      // summary and the next steps, which a toast could not hold on screen
      // long enough to be read.
      setSubmitted(created);
      setDocumentType("");
      setOrgUuid("");
      setOtherOrgName("");
      setOtherOrgEmail("");
      setOtherOrgPhone("");
      setOtherOrgWebsite("");
      setRemarks("");
      setDocumentOwnerCnic("");
      setDocumentOwnerName("");
      setFile(null);
      await onCreated();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? t("requests.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("requests.create.title")}</DialogTitle>
            <DialogDescription>
              {t("requests.create.description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              {/* Document type */}
              <div className="space-y-2">
                <Label>{t("requests.table.docType")}</Label>
                <SearchableSelect
                  items={documentTypeOptions}
                  value={documentType}
                  onChange={setDocumentType}
                  placeholder={t("requests.create.selectDocType")}
                  searchPlaceholder={t("requests.create.searchDocType", "Search document…")}
                />
              </div>

              {/* Issuing organization */}
              <div className="space-y-2">
                <div className="flex h-5 items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <Label>{t("requests.create.targetOrg")}</Label>
                </div>
                <SearchableSelect
                  items={[
                    ...orgOptions.map((o) => ({ value: o.uuid, label: o.name })),
                    { value: "__other__", label: t("requests.create.otherNotListed") },
                  ]}
                  value={orgUuid}
                  onChange={setOrgUuid}
                  placeholder={t("requests.create.selectOrg")}
                  searchPlaceholder={t("requests.create.searchOrg", "Search organization…")}
                />
              </div>
            </div>

            {isOther ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                <p className="text-xs font-medium text-muted-foreground">{t("requests.create.orgDetails")}</p>
                <div className="space-y-2">
                  <Label>{t("requests.create.orgName")}</Label>
                  <Input
                    value={otherOrgName}
                    onChange={(e) => setOtherOrgName(e.target.value)}
                    placeholder={t("requests.create.orgNamePlaceholder")}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("requests.create.emailOptional")}</Label>
                    <Input
                      type="email"
                      value={otherOrgEmail}
                      onChange={(e) => setOtherOrgEmail(e.target.value)}
                      placeholder="org@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("requests.create.phoneOptional")}</Label>
                    <Input
                      value={otherOrgPhone}
                      onChange={(e) => setOtherOrgPhone(digitsOnly(e.target.value))}
                      placeholder="+92 300 1234567"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t("requests.create.websiteOptional")}</Label>
                  <Input
                    value={otherOrgWebsite}
                    onChange={(e) => setOtherOrgWebsite(e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("requests.create.onboardNote")}
                </p>
              </div>
            ) : null}

            <Separator />

            <div className="grid gap-5 sm:grid-cols-2">
              {/* Document owner's name */}
              <div className="space-y-2">
                <Label>{t("requests.create.documentOwnerName")}</Label>
                <Input
                  value={documentOwnerName}
                  onChange={(e) => setDocumentOwnerName(e.target.value)}
                  placeholder={t("requests.create.documentOwnerNamePlaceholder")}
                  maxLength={200}
                />
              </div>

              {/* Document owner's CNIC */}
              <div className="space-y-2">
                <Label>{t("requests.create.documentOwnerCnic")}</Label>
                <Input
                  value={documentOwnerCnic}
                  onChange={(e) => setDocumentOwnerCnic(formatCNIC(e.target.value))}
                  placeholder="XXXXX-XXXXXXX-X"
                  maxLength={15}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {/* Document */}
              <div className="space-y-2">
                <Label>{t("requests.create.document")}</Label>
                <label
                  htmlFor="doc-file"
                  className="flex h-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border bg-muted/25 px-4 py-5 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <UploadCloud className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {file ? file.name : t("requests.create.clickToUpload")}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("requests.create.fileHint")}</span>
                  <input
                    id="doc-file"
                    type="file"
                    accept={UPLOADABLE_DOC_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const picked = e.target.files?.[0] ?? null;
                      // Reject on pick, not on submit: a user who chose a .heic or
                      // a 40MB scan finds out while the file is still in their hand.
                      const problem = validateUploadableFile(picked);
                      if (problem) {
                        toast.error(problem.message);
                        setFile(null);
                        // Clear the input so re-picking the same file fires onChange.
                        e.target.value = "";
                        return;
                      }
                      setFile(picked);
                    }}
                  />
                </label>
              </div>

              {/* Remarks */}
              <div className="space-y-2">
                <Label>{t("requests.create.remarksOptional")}</Label>
                <Textarea
                  rows={3}
                  className="h-full min-h-[104px] resize-none"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={t("requests.create.remarksPlaceholder")}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {t("requests.create.cancel")}
            </Button>
            <Button onClick={submit} loading={submitting}>
              {!submitting && <FileCheck2 className="mr-2 h-4 w-4" />}
              {t("requests.create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RequestSubmittedModal request={submitted} onClose={() => setSubmitted(null)} />
    </>
  );
}

function EditRequestDialog({
  request,
  onOpenChange,
  onDone,
}: {
  request: VerificationRequest | null;
  onOpenChange: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const orgs = useQuery({
    queryKey: ["orgs-for-request"],
    queryFn: () => requestsService.organizations(),
    enabled: !!request,
  });

  const [documentType, setDocumentType] = useState("");
  const [orgUuid, setOrgUuid] = useState<string>("");
  const [otherOrgName, setOtherOrgName] = useState("");
  const [otherOrgEmail, setOtherOrgEmail] = useState("");
  const [otherOrgPhone, setOtherOrgPhone] = useState("");
  const [otherOrgWebsite, setOtherOrgWebsite] = useState("");
  const [remarks, setRemarks] = useState("");
  const [documentOwnerName, setDocumentOwnerName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isOther = orgUuid === "__other__";
  const orgOptions = useMemo(() => orgs.data ?? [], [orgs.data]);

  const open = !!request;

  // Pre-fill when request changes
  useMemo(() => {
    if (request) {
      setDocumentType(request.document_type);
      setRemarks(request.submission_remarks ?? "");
      setDocumentOwnerName(request.document_owner_name ?? "");
      setOtherOrgName(request.unmatched_org_name ?? "");
      setOtherOrgEmail("");
      setOtherOrgPhone("");
      setOtherOrgWebsite("");
      setFile(null);
      if (request.issuing_organization_uuid) {
        setOrgUuid(request.issuing_organization_uuid);
      } else if (request.unmatched_org_name) {
        setOrgUuid("__other__");
      } else {
        setOrgUuid("");
      }
    }
  }, [request?.uuid]);

  const submit = async () => {
    if (!request) return;
    if (!documentType.trim()) return toast.error(t("requests.docTypeRequired"));
    // Same server-side allow-list check as the create form, so replacing the
    // document on an existing request cannot fail after the upload.
    if (file) {
      const fileProblem = validateUploadableFile(file);
      if (fileProblem) {
        toast.error(fileProblem.message);
        return;
      }
    }
    if (!orgUuid) return toast.error(t("requests.selectIssuingOrg"));
    if (isOther && !otherOrgName.trim()) return toast.error(t("requests.enterOrgName"));
    if (otherOrgEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otherOrgEmail))
      return toast.error(t("requests.validEmail"));

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("document_type", documentType);
      form.append("submission_remarks", remarks);
      form.append("document_owner_name", documentOwnerName.trim());
      if (isOther) {
        form.append("issuing_organization_uuid", "");
        form.append("other_organization_name", otherOrgName);
        if (otherOrgEmail) form.append("other_organization_email", otherOrgEmail);
        if (otherOrgPhone) form.append("other_organization_phone", otherOrgPhone);
        if (otherOrgWebsite) form.append("other_organization_website", otherOrgWebsite);
      } else {
        form.append("issuing_organization_uuid", orgUuid);
      }
      if (file) {
        form.append("document", file);
      }
      await requestsService.updateSent(request.uuid, form);
      toast.success(t("requests.requestUpdated"));
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? t("requests.updateFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("requests.edit.title")}</DialogTitle>
          <DialogDescription>
            {t("requests.edit.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("requests.table.docType")}</Label>
              <Input
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                placeholder={t("requests.edit.docTypePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("requests.edit.issuingOrg")}</Label>
              <Select value={orgUuid} onValueChange={setOrgUuid}>
                <SelectTrigger>
                  <SelectValue placeholder={t("requests.edit.selectOrg")} />
                </SelectTrigger>
                <SelectContent>
                  {orgOptions.map((o) => (
                    <SelectItem key={o.uuid} value={o.uuid}>
                      {o.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__other__">{t("requests.edit.otherNotListed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isOther ? (
            <>
              <div className="space-y-2">
                <Label>{t("requests.edit.orgName")}</Label>
                <Input
                  value={otherOrgName}
                  onChange={(e) => setOtherOrgName(e.target.value)}
                  placeholder={t("requests.edit.orgNamePlaceholder")}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("requests.edit.emailOptional")}</Label>
                  <Input
                    type="email"
                    value={otherOrgEmail}
                    onChange={(e) => setOtherOrgEmail(e.target.value)}
                    placeholder="org@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("requests.edit.phoneOptional")}</Label>
                  <Input
                    value={otherOrgPhone}
                    onChange={(e) => setOtherOrgPhone(digitsOnly(e.target.value))}
                    placeholder="+92 300 1234567"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("requests.edit.websiteOptional")}</Label>
                <Input
                  value={otherOrgWebsite}
                  onChange={(e) => setOtherOrgWebsite(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
            </>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("requests.create.documentOwnerName")}</Label>
              <Input
                value={documentOwnerName}
                onChange={(e) => setDocumentOwnerName(e.target.value)}
                placeholder={t("requests.create.documentOwnerNamePlaceholder")}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label>{t("requests.edit.remarksOptional")}</Label>
              <Textarea
                rows={3}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={t("requests.edit.remarksPlaceholder")}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{file ? "" : t("requests.edit.documentOptional")}</Label>
            {request?.document_path && !file && (
              <ProtectedDocumentLink
                storedPath={request.document_path}
                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-foreground hover:bg-muted/60"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {t("requests.edit.currentDocument", { format: request.document_format ?? "file" })}
                </span>
                <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </ProtectedDocumentLink>
            )}
            <label
              htmlFor="edit-doc-file"
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 px-4 py-6 text-center hover:bg-muted/60"
            >
              <UploadCloud className="mb-2 h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {file ? file.name : t("requests.edit.clickToUpload")}
              </span>
              <span className="mt-0.5 text-xs text-muted-foreground">{t("requests.edit.fileHint")}</span>
              <input
                id="edit-doc-file"
                type="file"
                accept={UPLOADABLE_DOC_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  const problem = validateUploadableFile(picked);
                  if (problem) {
                    toast.error(problem.message);
                    setFile(null);
                    e.target.value = "";
                    return;
                  }
                  setFile(picked);
                }}
              />
            </label>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onOpenChange} disabled={submitting}>
            {t("requests.edit.cancel")}
          </Button>
          <Button onClick={submit} loading={submitting}>
            {!submitting && <Pencil className="mr-2 h-4 w-4" />}
            {t("requests.edit.saveChanges")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}













