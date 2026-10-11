import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, FileSignature, Send, X } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { ApprovalTimeline } from "@/components/hr/ApprovalTimeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/common/PageHeader";
import { RecruitmentTabs } from "@/components/hr/RecruitmentTabs";
import { offersService, type Offer, type OfferApproval } from "@/services";
import { apiErrorMessage, formatDate, formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/recruitment/offers")({
  head: () => ({ meta: [{ title: "Offers — Dverif" }] }),
  component: OffersPage,
});

const PAGE_SIZE = 20;

/**
 * Approval status -> label key, spelled out rather than templated.
 *
 * Same reason as `STAGE_LABEL` on the candidates page: the i18n audit cannot see a
 * computed key, so `t(`recruitment.offerApproval${...}`)` would report all four as
 * unreferenced and a missing key would surface only as a raw path in the UI.
 */
const APPROVAL_LABEL: Record<OfferApproval["status"], string> = {
  pending: "recruitment.offerApprovalPending",
  approved: "recruitment.offerApprovalApproved",
  rejected: "recruitment.offerApprovalRejected",
  cancelled: "recruitment.offerApprovalNone",
};

const OFFER_STATUS_LABEL: Record<NonNullable<Offer["offer_status"]>, string> = {
  draft: "recruitment.offerStatusDraft",
  pending_approval: "recruitment.offerStatusPendingApproval",
  approved: "recruitment.offerStatusApproved",
  sent: "recruitment.offerStatusSent",
  accepted: "recruitment.offerStatusAccepted",
  declined: "recruitment.offerStatusDeclined",
  rejected: "recruitment.offerStatusRejected",
};

/**
 * EVERY HIRE'S APPOINTMENT LETTER, AND THE APPROVAL BEHIND IT.
 *
 * ONLY HIRED CANDIDATES APPEAR HERE, and that is a backend rule rather than a filter
 * on this page: the letter is minted by the hire, so a candidate still in the pipeline
 * has nothing to approve or send. The sequence on this page is therefore
 *
 *     hired (employee record + DRAFT letter)  ->  submit  ->  approve  ->  send
 *
 * and `send` is the step that issues the document, minting its reference number.
 *
 * THE APPROVAL IS NOT A STATUS COLUMN. It is the shared workflow engine's
 * append-only history, fetched per candidate and rendered through the SAME
 * `ApprovalTimeline` the other HR modules use. Two reasons, both load-bearing:
 *
 *  1. A "status: approved" column cannot show WHERE an in-flight approval is stuck.
 *     A two-step letter waiting on a director looks identical to one waiting on a
 *     peer, and the recruiter has no way to find out who to chase.
 *  2. Approving is not this module's own action. It calls
 *     `approvalWorkflow.service`, so the trail it renders is the engine's record
 *     rather than a second opinion invented here that could disagree with it.
 *
 * APPROVAL DOES NOT SEND THE LETTER, and they are two buttons: an approved letter is
 * still a draft until Send is pressed, because issuing is what makes it a real
 * document. The ordering is enforced twice — the button is only rendered where it can
 * succeed, and the API is the authority.
 */
function OffersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [reviewing, setReviewing] = useState<Offer | null>(null);

  const list = useQuery({
    queryKey: ["recruitment-offers", page],
    queryFn: () => offersService.list({ page, limit: PAGE_SIZE }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["recruitment-offers"] });
    void qc.invalidateQueries({ queryKey: ["recruitment-approval"] });
  };

  const send = useMutation({
    mutationFn: (o: Offer) => offersService.send(o.candidate_uuid),
    onSuccess: () => {
      invalidate();
      setReviewing(null);
      toast.success(t("recruitment.offerSent"));
    },
    // The sheet also renders a targeted hint for a missing template; the toast is
    // unconditional because every other refusal here (workflow misconfiguration, a
    // letter already issued, an approval resolved by someone else) would otherwise
    // close nothing and say nothing.
    onError: (e) => toast.error(apiErrorMessage(e, t("recruitment.offerActionFailed"))),
  });

  const respond = useMutation({
    /*
     * `portal_access` is NOT sent. An accepted offer creates the employee and
     * stops there — the invitation is a separate act on the employee row, where
     * the mailbox, timing and reason are chosen rather than inherited. See the
     * note on OfferSheet's accept control for what the recruiter is told instead.
     */
    mutationFn: ({ offer, response }: { offer: Offer; response: "accepted" | "declined" }) =>
      offersService.respond(offer.candidate_uuid, response, {
        comments: "Response recorded by HR",
      }),
    onSuccess: (result, variables) => {
      invalidate();
      setReviewing(null);
      toast.success(variables.response === "accepted"
        ? t("recruitment.hired", "Offer accepted and employee created")
        : t("recruitment.offerDeclined", "Offer declined"));
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("recruitment.offerActionFailed"))),
  });

  const columns: DataTableColumn<Offer>[] = [
    {
      key: "full_name",
      header: t("recruitment.candidate"),
      render: (o) => (
        <div>
          <p className="font-medium">{o.full_name}</p>
          <p className="text-xs text-muted-foreground">{o.opening_title ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "reference_no",
      header: t("recruitment.reference"),
      // No reference until the letter is issued — the number is minted by the send, so
      // showing a placeholder here would be inventing an identifier.
      render: (o) => <span className="font-mono text-xs">{o.reference_no ?? "—"}</span>,
    },
    {
      key: "offer_status",
      header: t("recruitment.status"),
      render: (o) => <Badge variant={o.offer_status === "rejected" || o.offer_status === "declined" ? "destructive" : "outline"}>
        {t(OFFER_STATUS_LABEL[o.offer_status ?? "draft"])}
      </Badge>,
    },
    {
      key: "hired_at",
      header: t("recruitment.offerSentDate"),
      render: (o) =>
        o.offer_sent_at ? (
          <span className="text-xs text-muted-foreground">{formatDate(o.offer_sent_at)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "actions",
      header: t("recruitment.actions"),
      render: (o) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setReviewing(o)}>
            <FileSignature className="mr-2 h-3.5 w-3.5" />
            {t("recruitment.offerApproval")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <ModuleGate module="recruitment_management">
      <div className="space-y-4">
        <PageHeader
          title={t("recruitment.offersTitle")}
          description={t("recruitment.offersDescription")}
        />

        <RecruitmentTabs />

        <DataTable
          columns={columns}
          rows={list.data?.items ?? []}
          total={list.data?.total}
          page={page}
          totalPages={list.data?.totalPages}
          onPageChange={setPage}
          loading={list.isLoading}
          // Same reasoning as the candidates table: a "Page 1 of 1" strip with both
          // buttons disabled says only that there is nothing more to fetch.
          showPagination={(list.data?.totalPages ?? 1) > 1}
          emptyIcon={FileSignature}
          emptyTitle={t("recruitment.noOffers")}
          emptyDescription={t("recruitment.noOffersDescription")}
        />
      </div>

      <OfferSheet
        offer={reviewing}
        onOpenChange={(v) => !v && setReviewing(null)}
        onDone={invalidate}
        onSend={(o) => send.mutate(o)}
        sending={send.isPending}
        sendError={send.isError ? send.error : null}
        onRespond={(offer, response) => respond.mutate({ offer, response })}
        responding={respond.isPending}
      />
    </ModuleGate>
  );
}

// ---------------------------------------------------------------------------

/**
 * ONE hire's letter, with its approval trail and the actions available on it.
 *
 * A SHEET, NOT A FORM DIALOG. There is no form here — approving is a direct call into
 * the approval engine, not a submission with fields — so FormDialog's required
 * `form` contract would have to be satisfied with a throwaway form object that exists
 * only to be ignored. A sheet also happens to be the right shape: the approval trail
 * can be any number of steps tall, and a fixed-height modal would scroll it out of
 * sight on a multi-step letter.
 *
 * THE ACTION SET DEPENDS ON WHERE THE APPROVAL IS, and the controls that cannot
 * succeed are not rendered:
 *
 *   - never submitted  -> Submit for approval
 *   - pending          -> Approve / Reject, plus the trail
 *   - approved         -> Send the letter
 *   - rejected         -> neither, and a hint to fix the terms and resubmit. The HIRE
 *                         stands either way: a rejected letter is a wrong document,
 *                         not a wrong person, and this must not read as a de-hiring.
 */
export function OfferSheet({
  offer,
  onOpenChange,
  onDone,
  onSend,
  sending,
  sendError,
  onRespond = () => undefined,
  responding = false,
}: {
  offer: Offer | null;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  onSend: (o: Offer) => void;
  sending: boolean;
  /**
   * The send mutation's error, handed down rather than re-run here.
   *
   * This sheet owns no mutation of its own, so it cannot ask "did the send fail?"
   * without being handed the answer. Passing the error is also what lets the hint below
   * be CONDITIONAL on the reason: only a missing template gets the template advice,
   * because telling someone to write a template when the real problem is that
   * someone else already approved the offer sends them to fix the wrong thing.
   */
  sendError: unknown;
  onRespond?: (offer: Offer, response: "accepted" | "declined") => void;
  responding?: boolean;
}) {
  const { t } = useTranslation();
  const open = Boolean(offer);
  const sendFailed = sendError != null;

  const approval = useQuery({
    queryKey: ["recruitment-approval", offer?.candidate_uuid],
    queryFn: () => offersService.getApproval(offer!.candidate_uuid),
    enabled: open,
  });

  const decide = useMutation({
    mutationFn: (v: { decision: "approve" | "reject"; comments?: string }) =>
      offersService.decide(offer!.candidate_uuid, v),
    onSuccess: () => {
      onDone();
      toast.success(t("recruitment.offerDecided"));
    },
    // The sheet also renders this message inline next to the buttons; the toast is
    // because that paragraph sits above the fold on a long approval trail, and a
    // decision that fails silently is the worst kind here — the button simply stops
    // doing anything.
    onError: (e) => toast.error(apiErrorMessage(e, t("recruitment.offerActionFailed"))),
  });

  const request = useMutation({
    mutationFn: () => offersService.requestApproval(offer!.candidate_uuid),
    onSuccess: () => {
      onDone();
      toast.success(t("recruitment.offerRequested"));
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("recruitment.offerActionFailed"))),
  });

  /**
   * Read from the freshest source, not from `approval.data` alone.
   *
   * A mutation resolves before the invalidated refetch lands, so reading the cache
   * straight after pressing Approve would briefly show the PENDING badge over
   * already-decided history — the exact flicker this panel exists to prevent. Once
   * a decision has been made this session, the local state is the truth until the
   * refetch confirms it.
   */
  const decidedHere = decide.isSuccess || request.isSuccess;
  const state: OfferApproval["status"] | null = decidedHere
    ? decide.isSuccess
      ? "approved"
      : request.isSuccess
        ? "pending"
        : (approval.data?.status ?? null)
    : (approval.data?.status ?? null);

  const error = decide.isError || request.isError;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{offer?.full_name ?? t("recruitment.offersTitle")}</SheetTitle>
          <SheetDescription>{t("recruitment.offersDescription")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <section className="space-y-1">
            <h3 className="text-sm font-medium">{t("recruitment.opening")}</h3>
            <p className="text-sm">{offer?.opening_title ?? "—"}</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">{t("recruitment.offerLifecycle", "Offer lifecycle")}</span>
              <Badge variant={offer?.offer_status === "declined" || offer?.offer_status === "rejected" ? "destructive" : "outline"}>
                {offer?.offer_status ? t(OFFER_STATUS_LABEL[offer.offer_status]) : t(OFFER_STATUS_LABEL.draft)}
              </Badge>
            </div>
            {offer?.offer_sent_at ? <p className="text-xs text-muted-foreground">{t("recruitment.offerSentDate")}: {formatDateTime(offer.offer_sent_at)}</p> : null}
            {offer?.offer_response_at ? <p className="text-xs text-muted-foreground">{t("recruitment.offerResponseDate", "Response recorded")}: {formatDateTime(offer.offer_response_at)}</p> : null}
            <p className="font-mono text-xs text-muted-foreground">
              {t("recruitment.reference")}: {offer?.reference_no ?? "—"}
            </p>
            {offer?.issued_at ? (
              <p className="text-xs text-muted-foreground">
                {t("recruitment.letterIssued")}: {formatDateTime(offer.issued_at)}
              </p>
            ) : null}
          </section>

          {offer?.offer_body_snapshot ? (
            <section className="space-y-2 rounded-md border p-3">
              <h3 className="text-sm font-medium">{t("recruitment.approvedOfferContent", "Offer content for approval / sending")}</h3>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{offer.offer_body_snapshot}</pre>
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("recruitment.offerApproval")}</h3>
            {state ? (
              <Badge
                variant={
                  state === "approved"
                    ? "secondary"
                    : state === "rejected"
                      ? "destructive"
                      : "outline"
                }
              >
                {t(APPROVAL_LABEL[state])}
              </Badge>
            ) : (
              <p className="text-sm text-muted-foreground">{t("recruitment.offerApprovalNone")}</p>
            )}

            {approval.data?.steps.length ? (
              <ApprovalTimeline
                steps={approval.data.steps}
                currentStepOrder={approval.data.currentStepOrder}
              />
            ) : null}
          </section>

          {error ? (
            <p className="text-sm text-destructive">
              {apiErrorMessage(decide.error ?? request.error, t("recruitment.offerActionFailed"))}
            </p>
          ) : null}

          <section className="space-y-2">
            {!state ? (
              <p className="text-sm text-muted-foreground">
                {t("recruitment.prepareOfferInPipeline", "Prepare the offer terms and preview in the candidate pipeline before requesting approval.")}
                <Link className="ml-1 underline" to="/org/recruitment/pipeline">{t("recruitment.openPipeline", "Open pipeline")}</Link>
              </p>
            ) : null}

            {state === "pending" ? (
              <DecisionButtons
                onDecide={(decision, comments) =>
                  decide.mutate({
                    decision,
                    comments: comments.trim() || undefined,
                  })
                }
                pending={decide.isPending}
              />
            ) : null}

            {/*
              The Send button, plus the one precondition it cannot satisfy by itself.

              A letter with no template cannot be issued — the server renders from the
              template body and refuses with "This letter has no template to render
              from". So when the approved letter has no template, the button is still
              shown (the recruiter has done their part) but the reason is stated next to
              it, with a link to the place that fixes it. Showing a bare enabled button
              that always 400s is the dead-control failure: the person concludes the
              page is broken rather than that a template is missing.
            */}
            {state === "approved" && offer?.offer_status === "approved" ? (
              <div className="space-y-2">
                <Button disabled={sending} onClick={() => offer && onSend(offer)}>
                  <Send className="mr-2 h-4 w-4" />
                  {t("recruitment.sendOffer")}
                </Button>
                {sendFailed && /template/i.test(apiErrorMessage(sendError, "")) ? (
                  <p className="text-xs text-destructive">{t("recruitment.letterNeedsTemplate")}</p>
                ) : null}
              </div>
            ) : null}

            {state === "approved" ? (
              <p className="text-xs text-muted-foreground">{t("recruitment.sendOfferHint")}</p>
            ) : null}

            {state === "rejected" ? (
              <p className="text-xs text-muted-foreground">
                {t("recruitment.offerRejectedHint")}
                <Link className="ml-1 underline" to="/org/recruitment/pipeline">{t("recruitment.reviseAndResubmit", "Revise and resubmit in the pipeline")}</Link>
              </p>
            ) : null}
            {offer?.offer_status === "sent" ? (
              <div className="space-y-2">
                {/*
                 * NO "SEND THE INVITATION TOO" CHECKBOX, and its absence is said
                 * out loud rather than left to be discovered.
                 *
                 * It used to be here, and accepting an offer created the platform
                 * account and emailed a set-password link in the same breath.
                 * That bundled two decisions — this person starts, and this
                 * person can log in — into one click, and the second one was
                 * never really being made: it was inherited from the first.
                 *
                 * The invitation now goes out from the employee row, where the
                 * "Send email" action lives and the recruiter can see what
                 * already happened for that person. A hint is left here so the
                 * person accepting the offer knows the invite is not cut off,
                 * only moved.
                 */}
                <p className="text-xs text-muted-foreground">
                  {t("recruitment.acceptanceCreatesEmployee")}
                </p>
                <div className="flex gap-2">
                  <Button disabled={responding} onClick={() => offer && onRespond(offer, "accepted")}>
                    {t("recruitment.acceptOffer", "Record acceptance")}
                  </Button>
                  <Button variant="outline" disabled={responding} onClick={() => offer && onRespond(offer, "declined")}>
                    {t("recruitment.declineOffer", "Record decline")}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Approve / Reject with a comment field that is asked for up front rather than after
 * the decision.
 *
 * Two buttons, not a select: these are not two values of one choice — rejecting wants
 * a reason and approving does not, and a shared select would only reveal the reason
 * field once the decision was already made, which is too late for the server's
 * rejection note and easy to skip entirely.
 *
 * The comment is passed to the engine on BOTH decisions, because on an approve it is
 * recorded as the approval note and on a reject as the rejection reason. It is not
 * required for an approve, because refusing to record a good offer over a missing
 * note would be worse than an unannotated one.
 */
function DecisionButtons({
  onDecide,
  pending,
}: {
  onDecide: (decision: "approve" | "reject", comments: string) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [comments, setComments] = useState("");

  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        <span className="font-medium">{t("recruitment.decisionComments")}</span>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
        <span className="block text-xs text-muted-foreground">
          {t("recruitment.decisionCommentsHint")}
        </span>
      </label>
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => onDecide("approve", comments)}>
          <Check className="mr-2 h-4 w-4" />
          {t("recruitment.approveOffer")}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => onDecide("reject", comments)}>
          <X className="mr-2 h-4 w-4" />
          {t("recruitment.rejectOffer")}
        </Button>
      </div>
    </div>
  );
}
