import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { BadgeCheck, Check, ExternalLink, ListChecks, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/utils";
import { isVerifiedRequestStatus, type VerificationRequest } from "@/services";

/** Animated paper-plane confirmation icon. */
function SuccessMark({ verified }: { verified: boolean }) {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <span className="absolute inset-0 animate-success-ring rounded-full bg-success/15" />
      <span className="animate-success-pop relative flex h-20 w-20 items-center justify-center rounded-full bg-success text-success-foreground shadow-lg">
        <style>{`@keyframes submitted-plane-fly { 0% { opacity: 0; transform: translate(-13px, 9px) rotate(-22deg) scale(.72); } 55% { opacity: 1; transform: translate(3px, -2px) rotate(7deg) scale(1.08); } 100% { opacity: 1; transform: translate(0, 0) rotate(0) scale(1); } }
          @keyframes submitted-check-pop { 0% { opacity: 0; transform: scale(.35) rotate(-25deg); } 65% { opacity: 1; transform: scale(1.18) rotate(8deg); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
          @media (prefers-reduced-motion: no-preference) { .submitted-plane { animation: submitted-plane-fly 700ms cubic-bezier(.2,.8,.2,1) both; } .submitted-check { animation: submitted-check-pop 520ms cubic-bezier(.2,.8,.2,1) both; } }
          @media (prefers-reduced-motion: reduce) { .submitted-plane, .submitted-check { opacity: 1; transform: none; } }`}</style>
        {verified ? (
          <Check className="submitted-check h-11 w-11" strokeWidth={2.8} aria-hidden="true" />
        ) : (
          <Send className="submitted-plane h-10 w-10 -rotate-12" strokeWidth={2.4} aria-hidden="true" />
        )}
      </span>
    </div>
  );
}
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-semibold break-words text-foreground sm:text-right">{value}</dd>
    </div>
  );
}

/**
 * Success confirmation shown after a verification request is created.
 *
 * Replaces the old "Request submitted" toast: a toast auto-dismisses in a few
 * seconds, which is long enough to miss the summary of what was just submitted
 * and carries nothing the user can act on. This stays until dismissed and
 * offers the two useful next steps.
 *
 * When the backend auto-verified the upload (an exact-hash match against a
 * document already verified on the account) the request is born `verified`
 * rather than entering review. That is a materially different outcome, so it
 * gets its own title and copy, plus a link to the public certificate.
 */
export function RequestSubmittedModal({
  request,
  onClose,
}: {
  request: VerificationRequest | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!request) return null;

// Both automatic paths mint a QR token, so both are "closed on submission"
  // rather than "sent for review". The two need DIFFERENT explanations: 'auto'
  // means this exact file was verified here before, while 'automatic_match'
  // means it was matched against a verified reference. The old single string
  // claimed the former for both, which was simply untrue on the match path.
  const isAutoVerified = isVerifiedRequestStatus(request.status) && Boolean(request.qr_token);
  const isRepeatOfVerifiedFile = request.verification_method === "auto";
  const autoVerifiedDescription =
    request.verification_method === "automatic_match"
      ? t("requests.submitted.autoVerifiedByMatchDesc")
      : isRepeatOfVerifiedFile
        ? t("requests.submitted.instantlyVerifiedDesc")
        : t("requests.submitted.autoVerifiedUnknownDesc");
  const targetOrg =
    request.issuing_org_name ?? request.unmatched_org_name ?? t("requests.submitted.unknownOrg");

  // The link comes from the API (built with the same helper that stamps the
  // certificate PDF), so the client never assembles a verify URL itself. It is
  // absent when the request has no QR yet, and the button is then omitted
  // rather than shown dead.
  const certificateUrl = request.verify_url ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg overflow-x-hidden sm:w-full">
        <DialogHeader>
<div className="flex justify-center pt-2 pb-1">
            <SuccessMark verified={isAutoVerified} />
          </div>
          <DialogTitle className="text-center text-xl">
            {isAutoVerified
              ? t("requests.submitted.autoVerified")
              : t("requests.submitted.title")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isAutoVerified
              ? autoVerifiedDescription
              : t("requests.submitted.sentTo", { org: targetOrg })}
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-2">
          <SummaryRow label={t("requests.submitted.docType")} value={request.document_type} />
          <SummaryRow
            label={t("requests.submitted.employeeName")}
            value={request.document_owner_name ?? "—"}
          />
          <SummaryRow
            label={t("requests.submitted.submittedAt")}
            value={formatDateTime(request.submitted_at)}
          />
        </dl>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              onClose();
              navigate({ to: "/requests" });
            }}
          >
            <ListChecks className="h-4 w-4" />
            {t("requests.submitted.viewMyRequests")}
          </Button>
          {certificateUrl && (
            <Button asChild className="w-full sm:w-auto">
              <a href={certificateUrl} target="_blank" rel="noopener noreferrer">
                <BadgeCheck className="h-4 w-4" />
                {t("requests.submitted.viewCertificate")}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          <Button className="w-full sm:w-auto" onClick={onClose}>
            {t("requests.submitted.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
