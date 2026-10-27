import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertCircle, Check, Eye, FileText, Loader2, Pencil, RefreshCw, UserPlus, Users } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { FormDialog } from "@/components/hr/FormDialog";
import { FileDropzone } from "@/components/hr/FileDropzone";
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
import { SearchInput } from "@/components/common/SearchInput";
import { RecruitmentTabs } from "@/components/hr/RecruitmentTabs";
import {
  CANDIDATE_STAGE_VARIANT,
  candidatesService,
  jobOpeningsService,
  type Candidate,
  type CandidateDetail,
  type CandidateStage,
} from "@/services";
import { RESUME_ACCEPT } from "@/lib/documentTypes";
import { cnicError, formatCNIC, normalizeCNIC, phoneError } from "@/lib/contactFormat";
import { apiErrorMessage, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/recruitment/candidates")({
  head: () => ({ meta: [{ title: "Candidates â€” Dverif" }] }),
  component: CandidatesPage,
});

const PAGE_SIZE = 20;

/**
 * Stage -> label key as an explicit lookup, not a template.
 *
 * `t(`recruitment.stageLabel.${c.stage}`)` would be shorter, but the i18n audit
 * script cannot see a computed key and would report all six as unreferenced â€” so a
 * stage dropped from en.json would go unnoticed. Naming them keeps them auditable,
 * the same reason expenses.status.* is spelled out on the claims page.
 */
const STAGE_LABEL: Record<CandidateStage, string> = {
  applied: "recruitment.stageLabel.applied",
  screening: "recruitment.stageLabel.screening",
  interview: "recruitment.stageLabel.interview",
  selected: "recruitment.stageLabel.selected",
  declined: "recruitment.stageLabel.declined",
  offered: "recruitment.stageLabel.offered",
  hired: "recruitment.stageLabel.hired",
  rejected: "recruitment.stageLabel.rejected",
};

/**
 * Everyone who has applied, with their stage.
 *
 * THIS PAGE HAS NO MOVE CONTROL, and that is deliberate. It is the searchable record
 * of who applied; the pipeline board is where a candidate changes stage, because a
 * stage change is a decision with a reason attached (rejection in particular), and
 * two places to do it would mean two places to do it without the reason. Anyone who
 * finds the "move a candidate" affordance missing here should be pointed at
 * /org/recruitment/pipeline rather than given a shortcut.
 *
 * Filtering by stage happens server-side via the list params, not by filtering the
 * returned page in the browser â€” otherwise selecting `rejected` on page 3 would show
 * nothing while rejected candidates existed, which reads as data loss.
 */
export function CandidatesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<CandidateStage | "">("");
  const [openingUuid, setOpeningUuid] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [viewing, setViewing] = useState<Candidate | null>(null);

  const openings = useQuery({
    queryKey: ["recruitment-openings"],
    queryFn: () => jobOpeningsService.list("open"),
  });

  const list = useQuery({
    queryKey: ["recruitment-candidates-list", page, stage, openingUuid, search],
    queryFn: () =>
      candidatesService.list({
        page,
        limit: PAGE_SIZE,
        stage: stage || undefined,
        opening_uuid: openingUuid || undefined,
        search: search || undefined,
      }),
  });

  const detail = useQuery({
    queryKey: ["recruitment-candidate", viewing?.uuid],
    queryFn: () => candidatesService.get(viewing!.uuid),
    enabled: Boolean(viewing?.uuid),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["recruitment-candidates-list"] });
    void qc.invalidateQueries({ queryKey: ["recruitment-candidate"] });
    void qc.invalidateQueries({ queryKey: ["recruitment-openings"] });
  };

  /** Every filter change returns to page 1 â€” see the same reasoning on claims. */
  const resetPage =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setPage(1);
    };

  const columns: DataTableColumn<Candidate>[] = [
    {
      key: "full_name",
      header: t("recruitment.candidateName"),
      render: (c) => (
        <div>
          <p className="font-medium">{c.full_name}</p>
          <p className="text-xs text-muted-foreground">{c.email ?? "â€”"}</p>
        </div>
      ),
    },
    {
      key: "opening",
      header: t("recruitment.opening"),
      render: (c) => <span className="text-sm">{c.opening_title ?? "â€”"}</span>,
    },
    {
      key: "stage",
      header: t("recruitment.stage"),
      render: (c) => (
        <Badge variant={CANDIDATE_STAGE_VARIANT[c.stage]}>{t(STAGE_LABEL[c.stage])}</Badge>
      ),
    },
    {
      key: "rating",
      header: t("recruitment.rating"),
      render: (c) => <span className="font-mono text-xs">{c.rating ?? "â€”"}</span>,
    },
    {
      key: "interviews",
      header: t("recruitment.interviewCount"),
      render: (c) => <span className="font-mono text-xs">{c.completed_interviews ?? 0}</span>,
    },
    {
      key: "created_at",
      header: t("recruitment.appliedOn"),
      render: (c) => (
        <span className="text-xs text-muted-foreground">{formatDate(c.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: t("recruitment.actions"),
      render: (c) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setViewing(c)}>
            <Eye className="mr-2 h-3.5 w-3.5" />
            {t("recruitment.resume")}
          </Button>
          {c.offer_status !== "sent" && c.offer_status !== "hired" && c.stage !== "hired" ? (
            <Button variant="ghost" size="sm" onClick={() => setEditingCandidate(c)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              {t("recruitment.editCandidate")}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <ModuleGate module="recruitment_management">
      <div className="space-y-4">
        <PageHeader
          title={t("recruitment.candidatesTitle")}
          description={t("recruitment.candidatesDescription")}
          actions={<Button onClick={() => setAdding(true)}>{t("recruitment.newCandidate")}</Button>}
        />

        <RecruitmentTabs />

        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={resetPage(setSearch)}
            placeholder={t("recruitment.searchCandidates")}
          />
          <select
            value={stage}
            onChange={(e) => resetPage(setStage)(e.target.value as CandidateStage | "")}
            aria-label={t("recruitment.stage")}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">{t("recruitment.stage")}</option>
            {(Object.keys(STAGE_LABEL) as CandidateStage[]).map((s) => (
              <option key={s} value={s}>
                {t(STAGE_LABEL[s])}
              </option>
            ))}
          </select>
          <select
            value={openingUuid}
            onChange={(e) => resetPage(setOpeningUuid)(e.target.value)}
            aria-label={t("recruitment.opening")}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">{t("recruitment.opening")}</option>
            {(openings.data ?? []).map((o) => (
              <option key={o.uuid} value={o.uuid}>
                {o.title}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          columns={columns}
          rows={list.data?.items ?? []}
          total={list.data?.total}
          page={page}
          totalPages={list.data?.totalPages}
          onPageChange={setPage}
          loading={list.isLoading}
          /*
           * HIDDEN WHEN THERE IS ONLY ONE PAGE.

           "Page 1 of 1 Â· 3 results" with a greyed Previous and Next is noise that
           states nothing: both buttons are already disabled at the boundary, so the
           control communicates only that there is nothing to page through â€” which the
           absence of a scrollbar already said.

           Done HERE rather than in the shared `Pagination`, because no other module in
           the app hides it and changing that component would silently alter the chrome
           of every list in the product. This is a local decision until the app-wide
           one is made deliberately; the comment records that so it is not mistaken for
           an inconsistency to be tidied away.
           */
          showPagination={(list.data?.totalPages ?? 1) > 1}
          emptyIcon={Users}
          emptyTitle={t("recruitment.noCandidates")}
          emptyDescription={t("recruitment.noCandidatesDescription")}
          emptyAction={
            <Button onClick={() => setAdding(true)}>{t("recruitment.newCandidate")}</Button>
          }
        />
      </div>

      <AddCandidateDialog
        open={adding || Boolean(editingCandidate)}
        candidate={editingCandidate}
        openings={openings.data ?? []}
        onOpenChange={(next) => {
          if (!next) {
            setAdding(false);
            setEditingCandidate(null);
          } else if (!editingCandidate) setAdding(true);
        }}
        onDone={invalidate}
      />

      <CandidateSheet
        candidateUuid={viewing?.uuid ?? null}
        onOpenChange={(v) => !v && setViewing(null)}
        onEdit={(candidate) => {
          setViewing(null);
          setEditingCandidate(candidate);
        }}
      />
    </ModuleGate>
  );
}

// ---------------------------------------------------------------------------

type AddForm = {
  opening_uuid: string;
  full_name: string;
  email: string;
  phone: string;
  cnic: string;
  cover_letter: string;
  notes: string;
};

/**
 * What the CV read gave us, per field.
 *
 * SHAPED BY WHAT THE EXTRACTOR CAN ACTUALLY DO. The document service reads the
 * header of a CV as well as labelled fields: name, email, phone and CNIC are
 * available, and designation is kept for the "read as" hint even though the
 * candidate form has no separate designation input. Cover letter and notes are
 * not extractable and are never invented here.
 */
type ParsedResume = {
  name?: string | null;
  name_confidence?: "high" | "low" | "not_visible" | null;
  cnic?: string | null;
  cnic_confidence?: "high" | "low" | "not_visible" | null;
  designation?: string | null;
  designation_confidence?: "high" | "low" | "not_visible" | null;
  email?: string | null;
  email_confidence?: "high" | "low" | "not_visible" | null;
  phone?: string | null;
  phone_confidence?: "high" | "low" | "not_visible" | null;
};

function buildCoverLetter(candidateName: string, openingTitle: string) {
  const name = candidateName.trim() || "Applicant";
  const role = openingTitle.trim() || "the advertised position";
  return `Dear Hiring Team,\n\nI am writing to apply for the ${role} position. Please find my CV attached for your consideration; it outlines my background and qualifications.\n\nI would welcome the opportunity to discuss how my experience and skills may fit the needs of this role. Thank you for your time and consideration.\n\nSincerely,\n${name}`;
}

/**
 * The small marker under a field that was filled in by the CV read.
 *
 * It says where the value came from rather than only which fields are
 * pre-filled, because a recruiter who typed over one of three values needs to
 * know that the untouched ones are still the machine's reading. `low-confidence`
 * is the "check this" case and is styled with the warning colour, not the
 * success one: a low-confidence extraction is not a problem, but it is not an
 * answer either.
 */
function ParsedFieldHint({
  value,
  confidence,
}: {
  value: string | null | undefined;
  confidence: "high" | "low" | "not_visible" | null | undefined;
}) {
  const { t } = useTranslation();
  if (!value) return null;

  const low = confidence === "low";
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        low ? "text-destructive" : "text-success"
      }`}
    >
      {low ? (
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Check className="h-3 w-3" aria-hidden="true" />
      )}
      {low
        ? t("recruitment.resumeLowConfidence")
        : t("recruitment.resumeReadAs", { value })}
    </span>
  );
}

function AddCandidateDialog({
  open,
  candidate,
  openings,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  candidate: Candidate | null;
  openings: { uuid: string; title: string }[];
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();

  /*
   * IDENTITY SHAPE ERRORS.
   *
   * The candidate form used to have no CNIC or phone validation at all, while the
   * employee form validated the same two fields and the sub-admin form validated
   * them a third way. Three forms, three rule sets, one database column that
   * eventually receives all of them â€” so a CNIC that was refused on one screen
   * was stored from another. The shared module supplies one rule; this is the
   * candidate screen's use of it.
   *
   * Optional-by-default, matching the recruiter's reality: a walk-in candidate's
   * CNIC is usually collected later, and `employees.cnic` is nullable for that
   * reason. A wrongly-shaped value that WAS typed is still refused here, before
   * it becomes a row.
   */
  const [identityErrors, setIdentityErrors] = useState<{ cnic?: string; phone?: string }>({});

  const form = useForm<AddForm>({
    defaultValues: {
      opening_uuid: "",
      full_name: "",
      email: "",
      phone: "",
      cnic: "",
      cover_letter: "",
      notes: "",
    },
  });
  const { reset } = form;

  /*
   * THE CV IS HELD OUTSIDE react-hook-form, because it is not one of the form's
   * fields â€” react-hook-form registers inputs by name and watches their value,
   * and a File has neither. Its lifecycle is also separate from the form's: the
   * dialog resets the inputs on open, and the CV has to be resettable
   * independently, or a recruiter who dropped the wrong file would have it
   * attached to the next candidate they added.
   */
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const parseSequence = useRef(0);
  const generatedCoverLetter = useRef("");
  /*
   * null until the recruiter has actually read the CV, then true on success and
   * false once a read has failed OR the CV was never read at all. The three are
   * deliberately distinct because the recruiter needs different answers: "cannot
   * read it" is retryable, "not read yet" is not a problem at all.
   */
  const [parseFailed, setParseFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    reset({
      opening_uuid: candidate?.job_opening_uuid ?? openings[0]?.uuid ?? "",
      full_name: candidate?.full_name ?? "",
      email: candidate?.email ?? "",
      phone: candidate?.phone ?? "",
      cnic: candidate?.cnic ? formatCNIC(candidate.cnic) : "",
      cover_letter: candidate?.cover_letter ?? "",
      notes: candidate?.notes ?? "",
    });
    setResumeFile(null);
    setParsed(null);
    setParseFailed(false);
    parseSequence.current += 1;
    generatedCoverLetter.current = "";
    setIdentityErrors({});
  }, [open, candidate?.uuid, openings, reset]);

  const selectedOpeningUuid = form.watch("opening_uuid");
  const watchedCandidateName = form.watch("full_name");

  useEffect(() => {
    if (!resumeFile) return;
    const openingTitle = openings.find((o) => o.uuid === selectedOpeningUuid)?.title;
    if (!openingTitle) return;

    const currentLetter = form.getValues("cover_letter");
    if (currentLetter && currentLetter !== generatedCoverLetter.current) return;

    const draft = buildCoverLetter(watchedCandidateName, openingTitle);
    form.setValue("cover_letter", draft, { shouldDirty: true });
    generatedCoverLetter.current = draft;
  }, [form, openings, resumeFile, selectedOpeningUuid, watchedCandidateName]);

  /*
   * Read the CV the moment it is dropped, not on submit.
   *
   * That ordering is the whole point of the feature: the recruiter sees what the
   * extractor found, corrects it, and saves once. If the read happened at submit
   * time the values would either be applied without review or the form would
   * have to be re-rendered with fields the recruiter had not seen â€” both of
   * which lose the review step the requirement asks for.
   *
   * The parsed values are FILLED INTO THE FORM rather than kept beside it, so
   * what the recruiter edits is what actually submits. There is no parallel
   * "parsed" state that could win a merge against a human's correction.
   */
  const parse = useMutation({
    mutationFn: ({ file }: { file: File; sequence: number }) => candidatesService.parseResume(file),
    onSuccess: (fields, variables) => {
      if (variables.sequence !== parseSequence.current) return;
      setParsed(fields);
      setParseFailed(false);
      /*
       * Only overwrite what is still empty. A recruiter who already typed a name
       * and then drops the CV should not have their typing silently replaced by
       * an OCR reading of the same thing - that is a surprise the resume feature
       * was specifically asked to avoid. `cnic` is degraphed before it is set
       * because the extractor returns the dashes, and a CNIC input holding them
       * would then submit them and fail the digits-only check.
       */
      if (fields.name && !form.getValues("full_name")) form.setValue("full_name", fields.name);
      if (fields.email && !form.getValues("email")) form.setValue("email", fields.email);
      if (fields.phone && !form.getValues("phone")) {
        form.setValue("phone", fields.phone);
        setIdentityErrors((prev) => ({ ...prev, phone: undefined }));
      }
      if (fields.cnic && !form.getValues("cnic")) {
        // Degraphed before it enters the input. The extractor returns the dashed
        // form because that is how a CNIC is printed and read; storing that
        // would put "42101-2345678-9" in a field that must submit digits, and the
        // digits-only check would then reject what the CV read correctly.
        form.setValue("cnic", normalizeCNIC(fields.cnic));
        setIdentityErrors((prev) => ({ ...prev, cnic: undefined }));
      }
    },
    onError: (_error, variables) => {
      if (variables.sequence !== parseSequence.current) return;
      // A failed read is NOT a failed form: the recruiter can still type the
      // candidate in by hand and save, so the file stays selected and can be
      // retried rather than being cleared out of the way.
      setParsed(null);
      setParseFailed(true);
      toast.error(t("recruitment.resumeParseFailed"));
    },
  });

  /*
   * Save the candidate, then attach the CV.
   *
   * TWO STEPS because the CV attaches to a candidate row that has to exist
   * first â€” the endpoint is `POST /org/candidates/:uuid/resume`. Chaining them
   * here rather than adding a multipart create endpoint keeps the candidate
   * create as pure JSON (and therefore unchanged for every other caller), and
   * reuses the existing upload route with its audit trail.
   *
   * THE CANDIDATE IS THE BRAND: if the CV upload fails, the candidate still
   * exists. Reporting only the failure would leave the recruiter re-adding
   * someone who is already in the list and hitting the 409 duplicate, which is
   * the worst possible feedback. So both cases are reported, and the dialog
   * only closes when the CV also attached.
   */
  const create = useMutation({
    mutationFn: async (v: AddForm) => {
      // Identity shape is checked HERE rather than via react-hook-form rules
      // because the same shared module serves three screens; registering the rule
      // per-input would be three more copies of it.
      const cnicProblem = cnicError(v.cnic);
      const phoneProblem = phoneError(v.phone);
      if (cnicProblem || phoneProblem) {
        setIdentityErrors({ cnic: cnicProblem ?? undefined, phone: phoneProblem ?? undefined });
        throw new Error("__identity_invalid__");
      }
      setIdentityErrors({});

      const payload = {
        full_name: v.full_name.trim(),
        // Empty -> undefined rather than "": an empty string is a supplied value and
        // would be stored as an email address of "" instead of a null.
        email: v.email.trim(),
        phone: v.phone.trim() || undefined,
        // Maskless: the column holds 13 digits, and the CV prefill strips the
        // dashes so both sources agree on one stored shape.
        cnic: normalizeCNIC(v.cnic) || undefined,
        cover_letter: v.cover_letter || undefined,
        notes: v.notes || undefined,
      };
      const saved = candidate
        ? await candidatesService.update(candidate.uuid, payload)
        : await candidatesService.create({ opening_uuid: v.opening_uuid, ...payload });

      if (resumeFile) {
        try {
          await candidatesService.uploadResume(saved.uuid, [resumeFile]);
          return { candidate: saved, resumeAttached: true };
        } catch {
          return { candidate: saved, resumeAttached: false };
        }
      }
      return { candidate: saved, resumeAttached: null };
    },
    onSuccess: (result) => {
      onDone();
      onOpenChange(false);
      if (result.resumeAttached === false) {
        // Candidate saved, CV not attached. Both halves said out loud, so the
        // recruiter knows to retry the CV on the candidate's row rather than
        // assuming the whole save failed.
        toast.warning(`${t(editing ? "recruitment.candidateUpdated" : "recruitment.candidateCreated")} ${t("recruitment.resumeAttachFailed")}`);
      } else if (result.resumeAttached === null) {
        toast.success(t(editing ? "recruitment.candidateUpdated" : "recruitment.candidateCreatedWithoutResume"));
      } else {
        toast.success(t(editing ? "recruitment.candidateUpdated" : "recruitment.candidateCreated"));
      }
    },
    // The duplicate-application case lands here: one row per candidate per opening is
    // enforced by a unique index, so re-adding the same person is a 409 the recruiter
    // needs told about rather than a form that appears to ignore them.
    //
    // The shape marker is checked first and quietly dropped: a CNIC that is 12
    // digits long is already reported on the input itself, and a toast saying
    // "cannot save the candidate" on top of it talks past the message the
    // recruiter is reading.
    onError: (e) => {
      if (e instanceof Error && e.message === "__identity_invalid__") return;
      toast.error(apiErrorMessage(e, t("recruitment.candidateActionFailed")));
    },
  });

  const editing = Boolean(candidate);
  const busy = parse.isPending || create.isPending;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      title={t(editing ? "recruitment.editCandidate" : "recruitment.newCandidate")}
      submitLabel={t("recruitment.save")}
      cancelLabel={t("recruitment.cancel")}
      onSubmit={(v) => create.mutate(v)}
    >
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.opening")} *</span>
          <select
            {...form.register("opening_uuid", { required: true })}
            disabled={editing}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {openings.map((o) => (
              <option key={o.uuid} value={o.uuid}>
                {o.title}
              </option>
            ))}
            {candidate && !openings.some((o) => o.uuid === candidate.job_opening_uuid) ? (
              <option value={candidate.job_opening_uuid}>{candidate.opening_title ?? t("recruitment.opening")}</option>
            ) : null}
          </select>
        </label>

        {/*
         * THE CV COMES FIRST, and deliberately so.

         The field order puts the dropzone above the fields it fills, because
         a recruiter who drops the CV first and then watches the name appear is
         having the form read the document for them; the reverse order means they
         fill four fields by hand and then notice the feature that would have
         filled them. Placed here it is the first thing seen, which is where
         "optional" earns its keep â€” it is skipped as fast as it is used.
         */}
        <div className="space-y-2">
          <FileDropzone
            value={resumeFile ? [resumeFile] : []}
            onChange={(files) => {
              const file = files[0] ?? null;
              const oldParsed = parsed;
              const clearIfStillFromOldCv = (field: "full_name" | "email" | "phone" | "cnic", oldValue: string | null | undefined) => {
                if (!oldValue) return;
                const normalizedOld = field === "cnic" ? normalizeCNIC(oldValue) : oldValue;
                if (form.getValues(field) === normalizedOld) {
                  form.setValue(field, "", { shouldDirty: true });
                }
              };

              if (!file || file !== resumeFile) {
                clearIfStillFromOldCv("full_name", oldParsed?.name);
                clearIfStillFromOldCv("email", oldParsed?.email);
                clearIfStillFromOldCv("phone", oldParsed?.phone);
                clearIfStillFromOldCv("cnic", oldParsed?.cnic);
                if (generatedCoverLetter.current && form.getValues("cover_letter") === generatedCoverLetter.current) {
                  form.setValue("cover_letter", "", { shouldDirty: true });
                }
                generatedCoverLetter.current = "";
              }

              const sequence = ++parseSequence.current;
              setResumeFile(file);
              setParsed(null);
              setParseFailed(false);
              if (file) parse.mutate({ file, sequence });
              else parse.reset();
              if (file) {
                const openingTitle = openings.find((o) => o.uuid === form.getValues("opening_uuid"))?.title;
                const currentLetter = form.getValues("cover_letter");
                if (openingTitle && (!currentLetter || currentLetter === generatedCoverLetter.current)) {
                  const draft = buildCoverLetter(form.getValues("full_name"), openingTitle);
                  form.setValue("cover_letter", draft, { shouldDirty: true });
                  generatedCoverLetter.current = draft;
                }
              }
            }}
            accept={RESUME_ACCEPT}
            maxFiles={1}
            maxSizeMb={10}
            disabled={busy}
            label={t("recruitment.resumeLabel")}
            hint={t("recruitment.resumeHint")}
          />

          {parse.isPending ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              {t("recruitment.parsingResume")}
            </p>
          ) : null}

          {/*
           * THE FAILURE LINE CARRIES THE RETRY, so the two things the recruiter
           * needs â€” what happened, and what to do â€” are one object rather than a
           * toast that vanishes and a control that only exists somewhere else.
           */}
          {parseFailed && !parse.isPending ? (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                {t("recruitment.resumeParseFailed")}
              </p>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-destructive"
                onClick={() => resumeFile && parse.mutate({ file: resumeFile, sequence: ++parseSequence.current })}
                disabled={!resumeFile}
              >
                <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
                {t("recruitment.resumeRetry")}
              </Button>
            </div>
          ) : null}

          {parsed && !parse.isPending ? (
            <p className="flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" aria-hidden="true" />
              {t("recruitment.resumeParsed")}
            </p>
          ) : null}

          {/*
           * THE NO-RESUME STATE IS STATED rather than left silent. A recruiter who
           * skipped the dropzone should not have to infer from an empty section
           * whether the CV was attached or simply not offered.
           */}
          {!resumeFile && !parse.isPending ? (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" aria-hidden="true" />
              {t("recruitment.resumeNoResume")}
            </p>
          ) : null}

          <ParsedFieldHint value={parsed?.name} confidence={parsed?.name_confidence} />
          <ParsedFieldHint value={parsed?.cnic} confidence={parsed?.cnic_confidence} />
        </div>

        {/* Row: Full Name + Email */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("recruitment.candidateName")} *</span>
            <input
              {...form.register("full_name", { required: true })}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("recruitment.candidateEmail")} *</span>
            <input
              type="email"
              {...form.register("email", { required: true })}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            />
            <ParsedFieldHint value={parsed?.email} confidence={parsed?.email_confidence} />
          </label>
        </div>

        {/* Row: Phone + CNIC */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("recruitment.candidatePhone")}</span>
            <input
              {...form.register("phone")}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              aria-invalid={Boolean(identityErrors.phone)}
            />
            {identityErrors.phone ? (
              <span className="text-xs text-destructive">{identityErrors.phone}</span>
            ) : (
              <ParsedFieldHint value={parsed?.phone} confidence={parsed?.phone_confidence} />
            )}
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{t("recruitment.candidateCnic")}</span>
            <input
              {...form.register("cnic")}
              inputMode="numeric"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              aria-invalid={Boolean(identityErrors.cnic)}
              onChange={(e) => {
                form.setValue("cnic", formatCNIC(e.target.value));
                setIdentityErrors((prev) => ({ ...prev, cnic: cnicError(e.target.value) ?? undefined }));
              }}
            />
            {identityErrors.cnic ? (
              <span className="text-xs text-destructive">{identityErrors.cnic}</span>
            ) : (
              <ParsedFieldHint value={parsed?.cnic} confidence={parsed?.cnic_confidence} />
            )}
          </label>
        </div>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.coverLetter")}</span>
          <textarea
            {...form.register("cover_letter")}
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
          <span className="text-xs text-muted-foreground">{t("recruitment.coverLetterAutoHint")}</span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.internalNotes")}</span>
          <textarea
            {...form.register("notes")}
            rows={2}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </label>
      </div>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------

/**
 * The candidate's record: how they applied, what they wrote, and who they met.
 *
 * Read-only, like the list. The stage change lives on the board, and resumes are
 * shown rather than uploaded here â€” attaching a file to someone's application is a
 * deliberate act that belongs on the row where the name is visible, not in a sheet
 * that slid over it.
 */
function CandidateSheet({
  candidateUuid,
  onOpenChange,
  onEdit,
}: {
  candidateUuid: string | null;
  onOpenChange: (v: boolean) => void;
  onEdit: (candidate: CandidateDetail) => void;
}) {
  const { t } = useTranslation();
  const open = Boolean(candidateUuid);

  const detail = useQuery({
    queryKey: ["recruitment-candidate", candidateUuid],
    queryFn: () => candidatesService.get(candidateUuid!),
    enabled: open,
  });

  const c = detail.data;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{c?.full_name ?? t("recruitment.loading")}</SheetTitle>
          <SheetDescription>
            {c?.opening?.title ?? t("recruitment.candidatesDescription")}
          </SheetDescription>
        </SheetHeader>

        {c ? (
          <div className="space-y-4">
            {c.offer_status !== "sent" && c.offer_status !== "hired" && c.stage !== "hired" ? (
              <Button className="w-full" variant="outline" onClick={() => onEdit(c)}>
                <Pencil className="mr-2 h-4 w-4" />
                {t("recruitment.editCandidate")}
              </Button>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Badge variant={CANDIDATE_STAGE_VARIANT[c.stage]}>{t(STAGE_LABEL[c.stage])}</Badge>
              {c.rating != null ? (
                <Badge variant="outline">
                  {t("recruitment.rating")}: {c.rating}
                </Badge>
              ) : null}
            </div>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("recruitment.candidateEmail")}</dt>
                <dd>{c.email ?? "â€”"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("recruitment.candidatePhone")}</dt>
                <dd>{c.phone ?? "â€”"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("recruitment.candidateCnic")}</dt>
                {/* The printed form, not 13 bare digits. The column holds
                    digits, but a CNIC is read by its grouping and the recruiter
                    comparing this against a CV is comparing against the dashed
                    version they see on the paper. */}
                <dd>{c.cnic ? formatCNIC(c.cnic) : "â€”"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("recruitment.appliedOn")}</dt>
                <dd>{formatDate(c.created_at)}</dd>
              </div>
            </dl>

            {c.rejected_reason ? (
              <section className="space-y-1">
                <h3 className="text-sm font-medium">{t("recruitment.rejectedColumn")}</h3>
                <p className="whitespace-pre-wrap text-sm text-destructive">{c.rejected_reason}</p>
              </section>
            ) : null}

            {c.notes ? (
              <section className="space-y-1">
                <h3 className="text-sm font-medium">{t("recruitment.internalNotes")}</h3>
                <p className="whitespace-pre-wrap text-sm">{c.notes}</p>
              </section>
            ) : null}

            <section className="space-y-1">
              <h3 className="text-sm font-medium">{t("recruitment.tabInterviews")}</h3>
              {c.interviews.length ? (
                <ul className="space-y-1 text-sm">
                  {c.interviews.map((i) => (
                    <li key={i.uuid} className="flex justify-between gap-2">
                      <span>{formatDate(i.scheduled_at)}</span>
                      <span className="text-muted-foreground">
                        {t(`recruitment.interviewOutcomeLabel.${i.outcome}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("recruitment.noInterviews")}</p>
              )}
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-medium">{t("recruitment.resume")}</h3>
              {c.resumes.length ? (
                <ul className="space-y-1 text-sm">
                  {c.resumes.map((r) => (
                    <li key={r.uuid}>{r.file_name}</li>
                  ))}
                </ul>
              ) : (
                /*
                 * NOT `noCandidates`. That key is the list's empty state â€” "no
                 * candidates yet" â€” and reusing it inside the resume section said the
                 * opposite of what was true: the candidate IS on the page, and it is
                 * their RESUME that is missing. A recruiter reading "No candidates yet"
                 * under a candidate's name has no way to tell a copy-paste slip from a
                 * real signal about their own pipeline.
                 */
                <p className="text-sm text-muted-foreground">{t("recruitment.noResume")}</p>
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
