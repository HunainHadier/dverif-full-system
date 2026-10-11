import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { UserPlus, Eye } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable } from "@/components/hr/DataTable";
import { FormDialog } from "@/components/hr/FormDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { RecruitmentTabs } from "@/components/hr/RecruitmentTabs";
import {
  CANDIDATE_STAGE_VARIANT,
  candidatesService,
  offersService,
  jobOpeningsService,
  PIPELINE_STAGES,
  type Candidate,
  type CandidateStage,
  type JobOpening,
  type OfferPreparation,
  type OfferPreview,
} from "@/services";
import { apiErrorMessage } from "@/lib/utils";
import { usePermissions } from "@/lib/permissions";
import { cnicError, formatCNIC, normalizeCNIC } from "@/lib/contactFormat";

export const Route = createFileRoute("/_app/org/recruitment/pipeline")({
  head: () => ({ meta: [{ title: "Recruitment Pipeline — Dverif" }] }),
  component: RecruitmentPipelinePage,
});

/**
 * The pipeline board: one opening, one column per stage, drag to move.
 *
 * DRAG-AND-DROP IS A REQUEST, NOT A RE-SORT.
 *
 * The obvious implementation — write the card into a new local array on drop, then
 * refetch on failure — shows the card in a stage the server may have refused, and
 * leaves the board lying about where the candidate is until something else
 * invalidates the cache. So no local re-ordering happens at all: the card renders
 * where `candidatesService.list` says it is, and a drop only fires the mutation. On
 * success the list refetches and the card appears in its new column because the
 * SERVER decided so. On failure it never leaves the old column, and the toast
 * carries the server's reason rather than a generic apology.
 *
 * The trade-off is a beat of latency between drop and the card landing, which is the
 * correct trade here: the board is a view of persisted state, not an optimistic
 * scratchpad.
 *
 * `hired` IS NOT A DROP TARGET. Reaching it means creating a person on the employee
 * roster and an offer letter, so it goes through the hire dialog's confirmation
 * instead of a drag that any mis-drop could trigger. `rejected` is likewise absent
 * from the flow — it takes a reason, so it is a dialog, and rejected candidates are
 * rendered below the board because they have LEFT the pipeline rather than sitting
 * in a column on the way to Hired.
 */
export function RecruitmentPipelinePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [openingUuid, setOpeningUuid] = useState("");
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState<CandidateStage | null>(null);
  const [hiring, setHiring] = useState<Candidate | null>(null);

  const openings = useQuery({
    queryKey: ["recruitment-openings"],
    queryFn: () => jobOpeningsService.list(),
  });

  /**
   * Falling back to the first opening rather than rendering an empty board behind a
   * dropdown. The page's purpose is a pipeline; a board with no columns reads as
   * "nothing is recruiting" when the truth is "pick something", and the user has to
   * know the openings list is even there.
   */
  const activeOpening =
    openings.data?.find((o) => o.uuid === openingUuid) ?? openings.data?.[0] ?? null;

  const candidates = useQuery({
    queryKey: ["recruitment-candidates", activeOpening?.uuid, search],
    queryFn: () =>
      candidatesService.list({
        opening_uuid: activeOpening!.uuid,
        limit: 200,
        search: search || undefined,
      }),
    enabled: Boolean(activeOpening?.uuid),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["recruitment-candidates"] });
    void qc.invalidateQueries({ queryKey: ["recruitment-openings"] });
  };

  const move = useMutation({
    mutationFn: (vars: { uuid: string; stage: CandidateStage }) =>
      candidatesService.moveStage(vars.uuid, {
        // `hired` is excluded by this type as well as by the column set, so a drop
        // on it could not compile even if someone added the column.
        stage: vars.stage as Exclude<CandidateStage, "hired">,
      }),
    onSuccess: () => {
      invalidate();
      toast.success(t("recruitment.moved"));
    },
    onError: (e) => {
      // No refetch-then-hope: the list was never changed locally, so the board is
      // already correct. The server's message names the stages it WILL accept, which
      // is the only thing worth telling someone who just dragged a card.
      invalidate();
      toast.error(apiErrorMessage(e, t("recruitment.moveFailed")));
    },
  });

  const visible = candidates.data?.items ?? [];
  const needle = search.trim().toLowerCase();
  const matches = (c: Candidate) => !needle || c.full_name.toLowerCase().includes(needle);

  /** `hired` is dropped: the list is the forward path only. */
  const columns = useMemo(
    () =>
      PIPELINE_STAGES.filter((s) => s !== "hired").map((stage) => ({
        stage,
        candidates: visible.filter((c) => c.stage === stage && matches(c)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `matches` closes over `needle`; both are listed.
    [visible, needle],
  );

  const rejected = visible.filter((c) => c.stage === "rejected" && matches(c));

  return (
    <ModuleGate module="recruitment_management">
      <div className="space-y-4">
        <PageHeader
          title={t("recruitment.title")}
          description={t("recruitment.moduleDescription")}
        />

        <RecruitmentTabs />

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={activeOpening?.uuid ?? ""}
            onChange={(e) => setOpeningUuid(e.target.value)}
            aria-label={t("recruitment.opening")}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            {(openings.data ?? []).map((o) => (
              /*
                THE VACANCY COUNT TRAVELS WITH THE OPENING'S NAME.

                It used to be a floating "Remaining: 20" beside the search box, where
                "remaining" had no referent — remaining candidates? remaining filters?
                And it was scoped to the SELECTED opening while sitting visually next to
                the search field, so switching openings in the dropdown left a stale
                number floating beside whatever was now selected, with nothing on screen
                tying the two together.

                Inside the option, the count is attached to the role it describes and
                cannot drift from it. Reading the dropdown also tells you at a glance
                which roles still have seats — which is the whole reason the number
                exists.
              */
              <option key={o.uuid} value={o.uuid}>
                {o.title} — {t("recruitment.vacanciesRemaining")} {o.vacancies_remaining ?? 0}
              </option>
            ))}
          </select>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("recruitment.searchCandidates")}
          />
        </div>

        {!openings.isLoading && !openings.data?.length ? (
          <DataTable
            columns={[]}
            rows={[]}
            emptyIcon={UserPlus}
            emptyTitle={t("recruitment.noOpenings")}
            emptyDescription={t("recruitment.noOpeningsDescription")}
          />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
              {columns.map((col) => (
                <PipelineColumn
                  key={col.stage}
                  stage={col.stage}
                  candidates={col.candidates}
                  isDragOver={dragOver === col.stage}
                  busy={move.isPending}
                  onDragOverState={(on) => setDragOver(on ? col.stage : null)}
                  onDropCandidate={(uuid) => {
                    setDragOver(null);
                    const candidate = visible.find((item) => item.uuid === uuid);
                    if (["selected", "offered"].includes(col.stage) && Number(candidate?.feedback_recorded_interviews ?? 0) < 1) {
                      toast.error("Record the interview feedback and select Passed or Failed before moving this candidate forward.");
                      return;
                    }
                    move.mutate({ uuid, stage: col.stage });
                  }}
                  onHire={setHiring}
                  onViewOffer={() => void navigate({ to: "/org/recruitment/offers" })}
                />
              ))}
            </div>

            {/*
              Rejected lives BELOW the board rather than as a sixth column. A
              rejection is where a candidate leaves the pipeline, so putting it in
              the flow would imply a rejected candidate is still progressing toward
              Hired — and would make `rejected` look like a normal stage transition.
            */}
            {rejected.length ? (
              <section className="space-y-2">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {t("recruitment.rejectedColumn")}
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {rejected.map((c) => (
                    <li key={c.uuid}>
                      <PipelineCard candidate={c} draggable={false} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <p className="text-xs text-muted-foreground">{t("recruitment.moveCardHint")}</p>
          </>
        )}
      </div>

      <HireDialog
        candidate={hiring}
        opening={activeOpening}
        onOpenChange={(open) => !open && setHiring(null)}
        onDone={invalidate}
      />
    </ModuleGate>
  );
}

// ---------------------------------------------------------------------------

function PipelineColumn({
  stage,
  candidates,
  isDragOver,
  busy,
  onDragOverState,
  onDropCandidate,
  onHire,
  onViewOffer,
}: {
  stage: CandidateStage;
  candidates: Candidate[];
  isDragOver: boolean;
  busy: boolean;
  onDragOverState: (on: boolean) => void;
  onDropCandidate: (uuid: string) => void;
  onHire: (c: Candidate) => void;
  onViewOffer: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        onDragOverState(true);
      }}
      onDragLeave={() => onDragOverState(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragOverState(false);
        const uuid = e.dataTransfer.getData("text/plain");
        if (uuid) onDropCandidate(uuid);
      }}
      className={[
        "flex min-h-40 flex-col gap-2 rounded-lg border p-2 transition-colors",
        isDragOver ? "border-primary bg-primary/5" : "border-border bg-card",
      ].join(" ")}
      data-testid={`column-${stage}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t(`recruitment.stageLabel.${stage}`)}
        </span>
        <Badge variant="outline">{candidates.length}</Badge>
      </div>

      {candidates.map((c) => (
        <PipelineCard key={c.uuid} candidate={c} draggable={!busy} onHire={() => onHire(c)} onViewOffer={onViewOffer} />
      ))}

      {isDragOver && !candidates.length ? (
        <p className="px-1 py-4 text-center text-xs text-muted-foreground">
          {t("recruitment.dropHere")}
        </p>
      ) : null}
    </div>
  );
}

function PipelineCard({
  candidate,
  draggable,
  onHire,
  onViewOffer,
}: {
  candidate: Candidate;
  draggable: boolean;
  onHire?: () => void;
  onViewOffer?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", candidate.uuid)}
      className="space-y-1 rounded-md border bg-background p-2 text-sm"
    >
      <p className="truncate font-medium">{candidate.full_name}</p>
      {candidate.opening_title ? (
        <p className="truncate text-xs text-muted-foreground">{candidate.opening_title}</p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {candidate.rating != null ? (
          <span className="text-xs text-muted-foreground">
            {t("recruitment.rating")}: {candidate.rating}
          </span>
        ) : (
          <span />
        )}
        <Badge variant={CANDIDATE_STAGE_VARIANT[candidate.stage]}>
          {t(`recruitment.stageLabel.${candidate.stage}`)}
        </Badge>
      </div>

      {/* Shown on the board, not only in the detail view: the reason is the record of
          WHY the pipeline lost someone, and a card that vanished without it makes a
          rejection unreviewable later. */}
      {candidate.rejected_reason ? (
        <p className="whitespace-pre-wrap text-xs text-destructive">{candidate.rejected_reason}</p>
      ) : null}

      {/*
        Only at `offered`, and only a button. This is the one action in the product
        that creates a person on the payroll, so it is never a drag and never a
        one-click gesture — the click opens a dialog that asks to confirm.
      */}
      {candidate.offer_status ? (
        <Button size="sm" variant="outline" className="w-full" onClick={onViewOffer}>
          <Eye className="mr-2 h-3.5 w-3.5" />
          {t("recruitment.viewOffer", "View offer")}
        </Button>
      ) : (candidate.stage === "selected" || candidate.stage === "offered") && onHire ? (
        <Button size="sm" className="w-full" onClick={onHire} disabled={Number(candidate.feedback_recorded_interviews ?? 0) < 1} title={Number(candidate.feedback_recorded_interviews ?? 0) < 1 ? "Record the interview feedback and select Passed or Failed before moving this candidate forward." : undefined}>
          <UserPlus className="mr-2 h-3.5 w-3.5" />
          {t("recruitment.prepareOffer", "Prepare offer")}
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

type OfferPreparationForm = {
  offer_template_uuid: string;
  offer_values: Record<string, string>;
};

function offerPreviewErrorMessage(error: unknown, fallback: string, invalidUuidMessage: string) {
  const message = apiErrorMessage(error, "");
  if (/template uuid must be a valid uuid/i.test(message)) {
    return invalidUuidMessage;
  }
  return message || fallback;
}

export function HireDialog({
  candidate,
  opening,
  onOpenChange,
  onDone,
}: {
  candidate: Candidate | null;
  opening: JobOpening | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const open = Boolean(candidate);
  const qc = useQueryClient();
  const permissions = usePermissions();
  const [preview, setPreview] = useState<OfferPreview | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const form = useForm<OfferPreparationForm>({ defaultValues: { offer_template_uuid: "", offer_values: {} } });
  const preparation = useQuery({
    queryKey: ["recruitment-offer-preparation", candidate?.uuid],
    queryFn: () => offersService.prepare(candidate!.uuid),
    enabled: open,
  });
  const templateUuid = form.watch("offer_template_uuid");
  const offerTemplates = (preparation.data?.templates ?? []).filter(
    (item) => item.letter_type === "offer" && item.is_active === 1,
  );
  const selectedTemplate = offerTemplates.find((item) => item.uuid === templateUuid);

  useEffect(() => {
    if (!candidate) {
      setPreview(null);
      setOverrideReason("");
      return;
    }
    form.reset({ offer_template_uuid: "", offer_values: {} });
    setPreview(null);
    setOverrideReason("");
  }, [candidate?.uuid, form]);

  useEffect(() => {
    const data = preparation.data;
    if (!data || !open) return;
    const current = form.getValues("offer_template_uuid");
    const activeOfferTemplates = data.templates.filter(
      (item) => item.letter_type === "offer" && item.is_active === 1,
    );
    const selected = [current, data.selected_template_uuid, activeOfferTemplates[0]?.uuid]
      .find((uuid) => activeOfferTemplates.some((item) => item.uuid === uuid)) ?? "";
    const existingValues = form.getValues("offer_values") ?? {};
    const next = { ...data.default_values, ...existingValues };
    form.reset({ offer_template_uuid: selected, offer_values: next });
  }, [preparation.data, open, form]);

  const submit = useMutation({
    mutationFn: (values: OfferPreparationForm) => {
      const data = { offer_template_uuid: values.offer_template_uuid, offer_values: values.offer_values };
      if (preparation.data?.candidate.final_interview_outcome === "failed") {
        if (!permissions.override_failed_interview) throw new Error("An authorized interview override is required.");
        if (!overrideReason.trim()) throw new Error("Enter the reason for the failed-interview exception.");
        return candidatesService.prepareOfferWithInterviewOverride(candidate!.uuid, { ...data, reason: overrideReason.trim() });
      }
      return candidatesService.prepareOffer(candidate!.uuid, data);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["recruitment-offers"] });
      onDone();
      onOpenChange(false);
      toast.success(t("recruitment.offerReady", "Offer is ready to send"));
      void navigate({ to: "/org/recruitment/offers" });
    },
    onError: (e) => {
      // The server names the rule that rejected the offer, including missing fields
      // or an unmet interview requirement. Discarding that
      // to point at the template sent people editing the one thing that was
      // fine, so the real message wins whenever the server gave one.
      form.setError("root.server", {
        message: apiErrorMessage(
          e,
          t(
            "recruitment.offerPrepareFailed",
            "Offer could not be prepared. Check the selected template and try again.",
          ),
        ),
      });
    },
  });

  const submitOffer = async (values: OfferPreparationForm) => {
    form.clearErrors("root.server");
    if (!offerTemplates.some((template) => template.uuid === values.offer_template_uuid)) {
      form.setError("root.server", {
        message: offerTemplates.length
          ? t("recruitment.selectOfferTemplate", "Select an Offer Letter template first.")
          : t("recruitment.noOfferTemplates", "No active Offer Letter template is available. Add one to continue."),
      });
      return;
    }
    if (preparation.data?.candidate.final_interview_outcome === "failed" && !permissions.override_failed_interview) {
      form.setError("root.server", { message: t("recruitment.noInterviewOverridePermission", "Ask an organization administrator with interview override permission to review this exception.") });
      return;
    }
    if (preparation.data?.candidate.final_interview_outcome === "failed" && permissions.override_failed_interview && !overrideReason.trim()) {
      form.setError("root.server", { message: t("recruitment.overrideReasonRequired", "Enter a reason for the failed-interview exception.") });
      return;
    }
    const offerCnic = values.offer_values?.cnic ?? "";
    const cnicProblem = cnicError(offerCnic);
    if (cnicProblem) {
      form.setError("offer_values.cnic", { type: "validate", message: cnicProblem });
      form.setError("root.server", { message: cnicProblem });
      return;
    }
    const offerValues = {
      ...values.offer_values,
      ...(offerCnic ? { cnic: normalizeCNIC(offerCnic) } : {}),
    };
    const missing = fields.filter((field) => !String(values.offer_values?.[field.tag] ?? "").trim());
    if (missing.length) {
      for (const field of missing) {
        const label = field.tag === "new_salary" ? t("recruitment.offeredSalary", "Offered salary") : field.label;
        form.setError(`offer_values.${field.tag}` as `offer_values.${string}`, { type: "required", message: `${label} is required` });
      }
      form.setError("root.server", { message: t("recruitment.offerMissingSummary", "Complete the required offer fields shown above before submitting.") });
      return;
    }
    try {
      const checked = await offersService.preview(candidate!.uuid, {
        template_uuid: values.offer_template_uuid,
        values: offerValues,
      });
      setPreview(checked);
      if (checked.unknown.length || checked.unresolved.length) {
        for (const field of checked.missing_fields) {
          form.setError(`offer_values.${field.tag}` as `offer_values.${string}`, {
            type: "required",
            message: `${field.label} is required`,
          });
        }
        form.setError("root.server", { message: t("recruitment.offerMissingSummary", "Complete the required offer fields shown above before submitting.") });
        return;
      }
      submit.mutate({ ...values, offer_values: offerValues });
    } catch (error) {
      form.setError("root.server", {
        message: offerPreviewErrorMessage(
          error,
          t("recruitment.offerPreviewFailed", "Could not preview the offer. Check the template and values."),
          t("recruitment.invalidOfferTemplate", "Select an active Offer Letter template, then preview again."),
        ),
      });
    }
  };

  const showPreview = async () => {
    if (!candidate || !offerTemplates.some((template) => template.uuid === templateUuid)) {
      form.setError("root.server", {
        message: offerTemplates.length
          ? t("recruitment.selectOfferTemplate", "Select an Offer Letter template first.")
          : t("recruitment.noOfferTemplates", "No active Offer Letter template is available. Add one to continue."),
      });
      return;
    }
    try {
      const result = await offersService.preview(candidate.uuid, {
        template_uuid: templateUuid,
        values: form.getValues("offer_values") ?? {},
      });
      setPreview(result);
      form.clearErrors("root.server");
      for (const field of result.missing_fields) {
        form.setError(`offer_values.${field.tag}` as `offer_values.${string}`, {
          type: "required",
          message: `${field.label} is required`,
        });
      }
    } catch (error) {
      form.setError("root.server", {
        message: offerPreviewErrorMessage(
          error,
          t("recruitment.offerPreviewFailed", "Preview unavailable. Check this Offer Letter template and its merge tags."),
          t("recruitment.invalidOfferTemplate", "Select an active Offer Letter template, then preview again."),
        ),
      });
    }
  };

  // Derive used tags from the template body. merge_fields may be stale or differently normalized.
  // The canonical registry supplies labels and sources; repeated body occurrences collapse here.
  const bodyTags = [...new Set(selectedTemplate?.body.match(/\$[a-zA-Z_][a-zA-Z0-9_]*/g)?.map((tag) => tag.slice(1)) ?? [])];
  const tags = bodyTags.map((name) => preparation.data?.merge_tags.find((tag) => tag.tag === name)).filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
  const fields = tags.filter((tag) => ["designation", "department", "joining_date", "cnic", "new_salary"].includes(tag.tag));

  return (
    <FormDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) { submit.reset(); setPreview(null); }
      }}
      form={form}
      title={t("recruitment.prepareOffer", "Prepare offer")}
      description={`${candidate?.full_name ?? ""} · ${t("recruitment.offerTermsApproval", "Complete the offer details before sending")}`}
      submitLabel={t("recruitment.createOffer", "Create offer")}
      cancelLabel={t("recruitment.cancel")}
      size="lg"
      onSubmit={submitOffer}
    >
      <div className="space-y-4">
        {preparation.isLoading ? <p className="text-sm text-muted-foreground">{t("common.loading", "Loading templates?")}</p> : null}
        {preparation.isError ? <p className="text-sm text-destructive">{t("recruitment.offerPrepareFailed", "Offer preparation data could not be loaded.")}</p> : null}
        {preparation.data?.candidate.final_interview_outcome === "failed" ? <div role="alert" className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p>{t("recruitment.failedInterviewBlocked", "The final interview outcome is Failed. A normal offer is blocked.")}</p>
          {permissions.override_failed_interview ? <label className="block space-y-1"><span className="font-medium">{t("recruitment.overrideReason", "Authorized exception reason")}</span><textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} rows={3} maxLength={1000} required className="w-full rounded-md border border-input bg-background px-3 py-2" /><span className="text-xs text-muted-foreground">{t("recruitment.overrideReasonAudit", "This reason and your account will be recorded in the audit trail.")}</span></label> : <p className="text-xs text-muted-foreground">{t("recruitment.noInterviewOverridePermission", "Ask an organization administrator with interview override permission to review this exception.")}</p>}
        </div> : null}
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">{t("letters.type", "Offer Letter template")}</span>
          <select onChange={(event) => { form.setValue("offer_template_uuid", event.target.value, { shouldDirty: true }); form.clearErrors(); setPreview(null); }} value={templateUuid}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
            <option value="">{t("recruitment.selectOfferTemplate", "Select an Offer Letter template")}</option>
            {offerTemplates.map((tpl) => (
              <option key={tpl.uuid} value={tpl.uuid}>{tpl.name}</option>
            ))}
          </select>
          {form.formState.errors.offer_template_uuid?.message ? <span className="text-xs text-destructive">{form.formState.errors.offer_template_uuid.message}</span> : null}
        </label>
        {preparation.data && offerTemplates.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            <p>{t("recruitment.noOfferTemplates", "No active Offer Letter template is available. Add one to continue.")}</p>
            <Button type="button" variant="outline" onClick={() => void navigate({ to: "/org/letter-templates" })}>
              {t("recruitment.addOfferTemplate", "Add offer letter")}
            </Button>
          </div>
        ) : null}
        {selectedTemplate && fields.length ? <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((tag) => {
            const fieldError = (form.formState.errors.offer_values as Record<string, { message?: string }> | undefined)?.[tag.tag]?.message;
            const label = tag.tag === "new_salary" ? t("recruitment.offeredSalary", "Offered salary") : tag.label;
            const fieldPath = `offer_values.${tag.tag}` as `offer_values.${string}`;
            const registeredField = form.register(fieldPath);
            return <label key={tag.tag} htmlFor={`offer-field-${tag.tag}`} className="block space-y-1.5 text-sm">
              <span className="font-medium">{label}</span>
              <input id={`offer-field-${tag.tag}`} aria-label={label} {...registeredField}
                value={tag.tag === "cnic" ? formatCNIC(form.watch(fieldPath) ?? "") : undefined}
                onChange={tag.tag === "cnic" ? (event) => {
                  const formatted = formatCNIC(event.target.value);
                  form.setValue(fieldPath, formatted, { shouldDirty: true, shouldValidate: true });
                  if (cnicError(formatted)) form.setError(fieldPath, { type: "validate", message: cnicError(formatted) ?? undefined });
                  else form.clearErrors(fieldPath);
                } : registeredField.onChange}
                type={tag.tag === "joining_date" ? "date" : "text"}
                inputMode={tag.tag === "cnic" ? "numeric" : undefined}
                maxLength={tag.tag === "cnic" ? 15 : undefined}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" />
              {tag.help ? <span className="block text-xs text-muted-foreground">{tag.help}</span> : null}
              {fieldError ? <span className="block text-xs text-destructive">{fieldError}</span> : null}
            </label>;
          })}
        </div> : null}
        {selectedTemplate ? <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">{t("recruitment.offerPreview", "Offer preview")}</h3>
            <Button type="button" variant="outline" size="sm" onClick={showPreview}>{t("common.preview", "Preview")}</Button>
          </div>
          {preview?.unresolved.length ? <div role="alert" className="text-sm text-destructive">
            <p>{t("recruitment.offerMissingSummary", "Complete these required offer fields before submitting:")}</p>
            <ul className="list-disc pl-5">{preview.missing_fields.map((field) => <li key={field.tag}>{field.label}</li>)}</ul>
          </div> : null}
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{preview?.rendered_body ?? selectedTemplate.body}</pre>
        </div> : null}
        {opening ? <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{opening.title}</span>
          {opening.department_name ? ` ? ${opening.department_name}` : ""}
        </p> : null}
        {form.formState.errors.root?.server?.message ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{form.formState.errors.root.server.message}</p> : null}
      </div>
    </FormDialog>
  );
}
