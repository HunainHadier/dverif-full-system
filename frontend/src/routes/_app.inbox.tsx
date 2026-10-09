import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ExternalLink, Eye, Inbox as InboxIcon, XCircle, BadgeCheck, FileSearch } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { Pagination } from "@/components/common/Pagination";
import { EmptyState } from "@/components/common/EmptyState";
import { RequestDetailModal } from "@/components/common/RequestDetailModal";
import { DecisionResultDialog } from "@/components/common/DecisionResultDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { requestsService, notificationService, type VerificationRequest } from "@/services";
import { formatDate, formatDateTime } from "@/lib/utils";
import { tDocType } from "@/i18n";
import { useOrgSubscription } from "@/hooks/useOrgSubscription";
import { usePermissions } from "@/lib/permissions";
import { authStore } from "@/lib/auth";
import { canAccessRoute } from "@/lib/routeAccess";
import { Lock } from "lucide-react";
import { ProtectedDocumentLink } from "@/components/common/ProtectedDocumentLink";

export const Route = createFileRoute("/_app/inbox")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Deliberately the same call the sidebar makes when deciding whether to
    // render this page's link -- one table, so a visible link and a reachable
    // page cannot disagree. See lib/routeAccess.
    if (!canAccessRoute(authStore.get().user, "/inbox")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({ meta: [{ title: "Inbox — Dverif" }] }),
  component: InboxPage,
});

function InboxPage() {
  const qc = useQueryClient();
  const { t } = useTranslation();
  const { isLocked } = useOrgSubscription();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [active, setActive] = useState<VerificationRequest | null>(null);
  const [viewing, setViewing] = useState<VerificationRequest | null>(null);
  const perms = usePermissions();
  const canApprove = perms.approve_request;

  const list = useQuery({
    queryKey: ["inbox", page, search, dateFrom, dateTo],
    queryFn: () =>
      requestsService.myInbox({
        page,
        limit: 10,
        search,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const items = list.data?.items ?? [];

  const markNotifRead = (reqUuid: string) => {
    notificationService.markReadByReference(reqUuid).then(() => {
      qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    });
  };

  const openReview = async (r: VerificationRequest) => {
    try {
      const detail = await requestsService.requestDetail(r.uuid);
      setActive(detail);
    } catch {
      setActive(r);
    }
  };

  useEffect(() => {
    if (active?.uuid) markNotifRead(active.uuid);
  }, [active?.uuid]);

  useEffect(() => {
    if (viewing?.uuid) markNotifRead(viewing.uuid);
  }, [viewing?.uuid]);

  return (
    <div>
      <PageHeader
        title={t("inbox.title")}
        description={isLocked ? t("inbox.lockedSub") : t("inbox.subtitle")}
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
              placeholder={t("inbox.searchPlaceholder")}
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
              <span className="text-xs text-muted-foreground max-sm:px-1">{t("common.to")}</span>
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
                icon={InboxIcon}
                title={t("inbox.emptyTitle")}
                description={t("inbox.emptyDesc")}
              />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">S.No</TableHead>
                    <TableHead>{t("inbox.requester")}</TableHead>
                    <TableHead>{t("inbox.documentType")}</TableHead>
                    <TableHead>{t("inbox.status")}</TableHead>
                    <TableHead>{t("inbox.submitted")}</TableHead>
                    <TableHead>{t("inbox.verifiedDate")}</TableHead>
                    <TableHead>{t("inbox.verifiedBy")}</TableHead>
                    <TableHead className="text-right">{t("inbox.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r, i) => (
                    <TableRow key={r.uuid}>
                      <TableCell className="w-10 text-muted-foreground">
                        {(page - 1) * 10 + i + 1}
                      </TableCell>
                      <TableCell
                        data-label={t("inbox.requester")}
                        className="font-medium text-foreground"
                      >
                        <div>{r.requester_name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.requester_organization ?? r.requester_email}
                        </div>
                      </TableCell>
                      <TableCell
                        data-label={t("inbox.documentType")}
                        className="text-muted-foreground"
                      >
                        {tDocType(r.document_type)}
                      </TableCell>
                      <TableCell data-label={t("inbox.status")}>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell
                        data-label={t("inbox.submitted")}
                        className="text-xs text-muted-foreground"
                      >
                        {formatDate(r.submitted_at)}
                      </TableCell>
                      <TableCell
                        data-label={t("inbox.verifiedDate")}
                        className="text-xs text-muted-foreground"
                      >
                        {r.status === "under_review" ? "—" : formatDate(r.verified_at)}
                      </TableCell>
                      <TableCell
                        data-label={t("inbox.verifiedBy")}
                        className="text-xs text-muted-foreground"
                      >
                        {r.status === "under_review" || !r.verified_by_name ? (
                          "—"
                        ) : (
                          <>
                            <div className="font-medium text-foreground">{r.verified_by_name}</div>
                            <div>{r.verified_by_email}</div>
                          </>
                        )}
                      </TableCell>
                      <TableCell data-label={t("inbox.actions")} className="mobile-actions-cell text-right">
                        <div className="flex flex-wrap items-center justify-start gap-1 sm:justify-end">
                          {r.matched_document_path && (
                            <Button
                              asChild
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title={
                                r.matched_document_name
                                  ? t("match.viewReferenceDocWith", {
                                      name: r.matched_document_name,
                                    })
                                  : t("match.viewReferenceDocument")
                              }
                            >
                              <ProtectedDocumentLink
                                storedPath={r.matched_document_path}
                                className="inline-flex h-8 w-8 items-center justify-center"
                              >
                                <FileSearch className="h-4 w-4" />
                              </ProtectedDocumentLink>
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => setViewing(r)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isLocked ? (
                            <Button size="sm" variant="outline" disabled>
                              <Lock className="mr-1 h-3 w-3" /> {t("common.locked")}
                            </Button>
                          ) : r.status === "under_review" && canApprove ? (
                            <Button size="sm" variant="outline" onClick={() => openReview(r)}>
                              {t("inbox.review")}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {r.status === "verified"
                                ? t("inbox.approved")
                                : r.status === "unverified"
                                  ? t("inbox.rejected")
                                  : t("inbox.processed")}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={page}
                totalPages={list.data?.totalPages ?? 1}
                total={list.data?.total ?? 0}
                onChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <VerifyDialog
        request={active}
        onClose={() => setActive(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["inbox"] });
          qc.invalidateQueries({ queryKey: ["inbox-count"] });
          setActive(null);
        }}
      />

      <RequestDetailModal request={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function VerifyDialog({
  request,
  onClose,
  onDone,
}: {
  request: VerificationRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [remarks, setRemarks] = useState("");
  // Set only when the user actually tries to reject with no reason. Kept out of
  // the initial render so the field is not permanently red before they type.
  const [remarksError, setRemarksError] = useState(false);
  const [pendingAction, setPendingAction] = useState<"verified" | "unverified" | null>(null);
  // A verification decision is acknowledged in the centre of the screen, not in
  // a corner toast: the outcome decides somebody's document, and a toast slides
  // away while the list is still refreshing underneath it.
  // The receipt has to carry its own copy of what was decided. It cannot read it
  // from `request`: onDone() closes the review dialog (setActive(null)) as part of
  // committing the decision, so by the time this dialog renders, `request` is
  // already null and the document type would interpolate as empty.
  const [decision, setDecision] = useState<null | {
    status: "verified" | "unverified";
    documentType: string;
  }>(null);
  const isFinalized = request && request.status !== "under_review";
  const { t } = useTranslation();

  // Rejecting is a judgement ABOUT the document, so the reason is mandatory
  // there; approving stays optional. Whitespace does not count as a reason.
  const rejectWithoutRemarks = remarks.trim().length === 0;

  // Sentences WITHOUT the {{type}} hole, used when the document type could not be
  // read. Rendering `The "" request` or `The "-" request` would be worse than
  // dropping the clause, so the sentence shape degrades instead of the text
  // breaking.
  const decisionDescription = (() => {
    if (!decision) return undefined;
    const approved = decision.status === "verified";
    const type = tDocType(decision.documentType);
    const hasType = Boolean(decision.documentType?.trim()) && type !== "-";
    return t(
      hasType
        ? approved
          ? "inbox.approvedModalDesc"
          : "inbox.rejectedModalDesc"
        : approved
          ? "inbox.approvedModalDescNoType"
          : "inbox.rejectedModalDescNoType",
      { type }
    );
  })();

  const verify = useMutation({
    mutationFn: (status: "verified" | "unverified") =>
      requestsService.verify(request!.uuid, {
        status,
        verification_remarks: remarks,
      }),
    onSuccess: (_data, status) => {
      // The receipt is shown FIRST and the review dialog closed underneath it,
      // so the confirmation is never competing with a list refresh. The document
      // type is captured here, while `request` still exists.
      setDecision({
        status,
        documentType: request?.document_type ?? "",
      });
      onDone();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t("common.failed")),
    onSettled: () => setPendingAction(null),
  });

  return (
    <>
    <Dialog open={!!request} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl sm:p-6">
        <DialogHeader>
          <DialogTitle>
            {isFinalized ? t("inbox.requestDetails") : t("inbox.reviewRequest")}
          </DialogTitle>
          <DialogDescription>
            {isFinalized ? t("inbox.alreadyFinalized") : t("inbox.finalizeDescription")}
          </DialogDescription>
        </DialogHeader>

        {request ? (
          <>
            {isFinalized && (
              <div
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${
                  request.status === "verified"
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                {request.status === "verified" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> {t("inbox.verifiedTag")}
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" /> {t("inbox.unverifiedTag")}
                  </>
                )}
                {request.verified_at && (
                  <span className="ml-auto text-xs font-normal opacity-70">
                    {formatDateTime(request.verified_at)}
                  </span>
                )}
              </div>
            )}

            <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-6">
              <div className="rounded-lg border border-border bg-muted/40 p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      {t("inbox.document")}
                    </div>
                    <div className="break-words text-sm font-semibold text-foreground">
                      {tDocType(request.document_type)}
                    </div>
                  </div>
                  {request.document_path ? (
                    <ProtectedDocumentLink
                      storedPath={request.document_path}
                      className="inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent sm:min-h-0"
                    >
                      {t("common.open")} <ExternalLink className="h-3 w-3" />
                    </ProtectedDocumentLink>
                  ) : null}
                </div>
                <dl className="grid gap-3 text-xs sm:grid-cols-2">
                  <MetaRow label={t("inbox.requester")} value={request.requester_name ?? "—"} />
                  <MetaRow
                    label={t("inbox.company")}
                    value={request.requester_organization ?? "—"}
                  />
                  <MetaRow
                    label={t("inbox.submitted")}
                    value={formatDateTime(request.submitted_at)}
                  />
                  {request.status !== "under_review" && (
                    <>
                      <MetaRow
                        label={t("inbox.verifiedBy")}
                        value={request.verified_by_name ?? "—"}
                      />
                      {request.verified_by_email ? (
                        <MetaRow label={t("inbox.verifiedByEmail")} value={request.verified_by_email} />
                      ) : null}
                    </>
                  )}
                </dl>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <Label>{t("inbox.requesterRemarks")}</Label>
                  <div className="mt-1.5 min-h-16 break-words rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                    {request.submission_remarks || t("common.noRemarks")}
                  </div>
                </div>

                {isFinalized ? (
                  <div className="space-y-2">
                    <Label>{t("inbox.verificationRemarks")}</Label>
                    <div className="min-h-16 break-words rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
                      {request.verification_remarks || t("common.noRemarks")}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="vrem">
                      {t("inbox.yourVerificationRemarks")}
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({t("inbox.requiredToReject")})
                      </span>
                    </Label>
                    <Textarea
                      id="vrem"
                      rows={4}
                      value={remarks}
                      onChange={(e) => {
                        setRemarks(e.target.value);
                        // Clear the error as soon as they start fixing it.
                        if (remarksError) setRemarksError(false);
                      }}
                      placeholder={t("inbox.remarksPlaceholder")}
                      maxLength={500}
                      aria-invalid={remarksError || undefined}
                      aria-describedby={remarksError ? "vrem-error" : undefined}
                      className={remarksError ? "border-destructive focus-visible:ring-destructive/40" : undefined}
                    />
                    {remarksError ? (
                      <p id="vrem-error" role="alert" className="text-xs text-destructive">
                        {t("inbox.rejectionRemarksRequired")}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}

        {request?.has_prior_verification && !!request.prior_verified_at && (
          <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t("inbox.preVerified", {
                date: formatDate(request.prior_verified_at),
              })}
            </span>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            onClick={onClose}
            disabled={verify.isPending}
          >
            {isFinalized ? t("common.close") : t("common.cancel")}
          </Button>
          {!isFinalized && (
            <>
              <Button
                variant="outline"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                onClick={() => {
                  // Client-side guard only. The server rejects an empty reason on
                  // this path with a 400 regardless, so this is about a clear
                  // message rather than about enforcement.
                  if (rejectWithoutRemarks) {
                    setRemarksError(true);
                    toast.error(t("inbox.rejectionRemarksRequired"));
                    document.getElementById("vrem")?.focus();
                    return;
                  }
                  setPendingAction("unverified");
                  verify.mutate("unverified");
                }}
                disabled={verify.isPending}
                loading={verify.isPending && pendingAction === "unverified"}
                title={rejectWithoutRemarks ? t("inbox.rejectionRemarksRequired") : undefined}
              >
                <XCircle className="mr-2 h-4 w-4" />
                {t("common.reject")}
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  setPendingAction("verified");
                  verify.mutate("verified");
                }}
                disabled={verify.isPending}
                loading={verify.isPending && pendingAction === "verified"}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {t("common.approve")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <DecisionResultDialog
      open={decision !== null}
      onOpenChange={(o) => !o && setDecision(null)}
      outcome={decision?.status === "verified" ? "success" : "destructive"}
      title={
        decision?.status === "verified"
          ? t("inbox.approvedModalTitle")
          : t("inbox.rejectedModalTitle")
      }
      description={decisionDescription}
      actionLabel={t("common.close")}
    />
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}
