import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, FileSignature, Loader2, Send, UserCheck } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/common/PageHeader";
import { RecruitmentTabs } from "@/components/hr/RecruitmentTabs";
import { offersService, type Offer } from "@/services";
import { apiErrorMessage, formatDate, formatDateTime } from "@/lib/utils";
import { cnicError, formatCNIC, normalizeCNIC } from "@/lib/contactFormat";

export const Route = createFileRoute("/_app/org/recruitment/offers")({
  head: () => ({ meta: [{ title: "Offers — Dverif" }] }),
  component: OffersPage,
});

const PAGE_SIZE = 20;
const SENDABLE_STATUSES = ["ready", "draft", "pending_approval", "approved"];

function displayStatus(status: Offer["offer_status"]): string {
  switch (status) {
    case "ready":
    case "draft":
    case "pending_approval":
    case "approved":
      return "Ready to send";
    case "sent":
      return "Sent";
    case "hired":
    case "accepted":
      return "Hired";
    default:
      return "Closed";
  }
}

export function OffersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Offer | null>(null);
  const [hireCnic, setHireCnic] = useState("");
  const [showCnicPrompt, setShowCnicPrompt] = useState(false);

  const list = useQuery({
    queryKey: ["recruitment-offers", page],
    queryFn: () => offersService.list({ page, limit: PAGE_SIZE }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["recruitment-offers"] });
    void qc.invalidateQueries({ queryKey: ["recruitment-candidates"] });
    void qc.invalidateQueries({ queryKey: ["recruitment-openings"] });
  };

  const send = useMutation({
    mutationFn: (offer: Offer) => offersService.send(offer.candidate_uuid),
    onSuccess: (_, offer) => {
      invalidate();
      setSelected((current) => current?.candidate_uuid === offer.candidate_uuid
        ? { ...current, offer_status: "sent", offer_sent_at: new Date().toISOString() }
        : current);
      toast.success(t("recruitment.offerSent", "Offer letter sent"));
    },
    onError: (error) => toast.error(apiErrorMessage(error, t("recruitment.offerActionFailed"))),
  });

  const download = useMutation({
    mutationFn: (offer: Offer) => offersService.downloadPdf(offer.candidate_uuid),
    onSuccess: (blob, offer) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(offer.reference_no || `offer-${offer.candidate_uuid.slice(0, 8)}`).replace(/[^\\w.-]+/g, "-")}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => toast.error(apiErrorMessage(error, t("recruitment.offerActionFailed"))),
  });

  const hire = useMutation({
    mutationFn: (args: { offer: Offer; cnic: string }) => offersService.hire(args.offer.candidate_uuid, { cnic: normalizeCNIC(args.cnic) }),
    onSuccess: () => {
      invalidate();
      setSelected(null);
      setShowCnicPrompt(false);
      setHireCnic("");
      toast.success(t("recruitment.hired", "Candidate hired and added to employees"));
    },
    onError: (error) => toast.error(apiErrorMessage(error, t("recruitment.offerActionFailed"))),
  });

  const columns: DataTableColumn<Offer>[] = [
    {
      key: "full_name",
      header: t("recruitment.candidate"),
      render: (offer) => (
        <div>
          <p className="font-medium">{offer.full_name}</p>
          <p className="text-xs text-muted-foreground">{offer.opening_title ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "reference_no",
      header: t("recruitment.reference"),
      render: (offer) => <span className="font-mono text-xs">{offer.reference_no ?? "—"}</span>,
    },
    {
      key: "offer_status",
      header: t("recruitment.status"),
      render: (offer) => <Badge variant="outline">{displayStatus(offer.offer_status)}</Badge>,
    },
    {
      key: "offer_sent_at",
      header: t("recruitment.offerSentDate"),
      render: (offer) => offer.offer_sent_at ? formatDate(offer.offer_sent_at) : "—",
    },
    {
      key: "actions",
      header: t("recruitment.actions"),
      render: (offer) => (
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setSelected(offer)}>
            <FileSignature className="mr-2 h-3.5 w-3.5" />
            {t("recruitment.viewOffer", "View offer")}
          </Button>
        </div>
      ),
    },
  ];

  const confirmHire = () => {
    const problem = cnicError(hireCnic);
    if (!hireCnic.trim()) {
      toast.error("CNIC is required");
      return;
    }
    if (problem) {
      toast.error(problem);
      return;
    }
    if (selected) hire.mutate({ offer: selected, cnic: hireCnic });
  };

  return (
    <ModuleGate module="recruitment_management">
      <div className="space-y-4">
        <PageHeader
          title={t("recruitment.offersTitle")}
          description={t("recruitment.offersDescription", "Prepared offers, sent letters, and hires.")}
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
          showPagination={(list.data?.totalPages ?? 1) > 1}
          emptyIcon={FileSignature}
          emptyTitle={t("recruitment.noOffers")}
          emptyDescription={t("recruitment.noOffersDescription")}
          emptyAction={
            <Button onClick={() => void navigate({ to: "/org/recruitment/pipeline" })}>
              {t("recruitment.prepareOffer", "Prepare offer")}
            </Button>
          }
        />
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full space-y-4 overflow-y-auto p-6 sm:max-w-xl lg:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{selected?.full_name ?? t("recruitment.offersTitle")}</SheetTitle>
            <SheetDescription>{selected?.email ?? ""}</SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <section className="space-y-1">
              <h3 className="text-sm font-medium">{t("recruitment.opening")}</h3>
              <p className="text-sm">{selected?.opening_title ?? "—"}</p>
              <Badge variant="outline">{displayStatus(selected?.offer_status)}</Badge>
              {selected?.offer_sent_at ? (
                <p className="text-xs text-muted-foreground">
                  {t("recruitment.offerSentDate")}: {formatDateTime(selected.offer_sent_at)}
                </p>
              ) : null}
              <p className="font-mono text-xs text-muted-foreground">
                {t("recruitment.reference")}: {selected?.reference_no ?? "—"}
              </p>
              {Number(selected?.feedback_recorded_interviews ?? 0) < 1 ? (
                <p className="text-sm text-amber-700">
                  Record interview feedback and select Passed or Failed before sending the offer or hiring.
                </p>
              ) : null}
            </section>

            {selected?.offer_body_snapshot ? (
              <section className="space-y-2 rounded-md border p-3">
                <h3 className="text-sm font-medium">{t("recruitment.offerContent", "Offer letter")}</h3>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">
                  {selected.offer_body_snapshot}
                </pre>
                <Button variant="outline" size="sm" disabled={download.isPending} onClick={() => selected && download.mutate(selected)}>
                  {download.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  {download.isPending ? t("recruitment.downloadingPdf", "Preparing PDF…") : t("recruitment.downloadOfferPdf", "Download PDF")}
                </Button>
              </section>
            ) : null}

            {SENDABLE_STATUSES.includes(selected?.offer_status ?? "") ? (
              <Button disabled={send.isPending || Number(selected?.feedback_recorded_interviews ?? 0) < 1} onClick={() => selected && send.mutate(selected)}>
                {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                {send.isPending ? t("recruitment.sendingOffer", "Sending…") : t("recruitment.sendOffer", "Send Offer Letter")}
              </Button>
            ) : selected?.offer_status === "sent" ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={send.isPending || Number(selected?.feedback_recorded_interviews ?? 0) < 1} onClick={() => selected && send.mutate(selected)}>
                  {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {send.isPending ? t("recruitment.sendingOffer", "Sending…") : t("recruitment.resendOffer", "Resend offer")}
                </Button>
                <Button disabled={hire.isPending || Number(selected?.feedback_recorded_interviews ?? 0) < 1} onClick={() => {
                  if (!selected) return;
                  if (!selected.cnic || cnicError(selected.cnic)) { setHireCnic(formatCNIC(selected.cnic ?? "")); setShowCnicPrompt(true); return; }
                  hire.mutate({ offer: selected, cnic: selected.cnic });
                }}>
                  <UserCheck className="mr-2 h-4 w-4" />
                  {t("recruitment.markHired", "Hired")}
                </Button>
              </div>
            ) : null}

          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={showCnicPrompt} onOpenChange={setShowCnicPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>CNIC required to hire</DialogTitle>
            <DialogDescription>Enter the candidate’s 13 digit CNIC to add them as an employee.</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">CNIC *</span>
            <input value={formatCNIC(hireCnic)} onChange={(event) => setHireCnic(formatCNIC(event.target.value))} inputMode="numeric" maxLength={15} placeholder="42101-2345678-9" aria-label="CNIC" className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
            {cnicError(hireCnic) ? <p className="text-xs text-destructive">{cnicError(hireCnic)}</p> : null}
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCnicPrompt(false)}>Cancel</Button>
            <Button disabled={!hireCnic.trim() || Boolean(cnicError(hireCnic)) || hire.isPending} onClick={() => {
              confirmHire();
              setShowCnicPrompt(false);
            }}>Continue hiring</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleGate>
  );
}
