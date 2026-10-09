import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Eye, UserPlus, Users } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { FormDialog } from "@/components/hr/FormDialog";
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
  type CandidateStage,
} from "@/services";
import { apiErrorMessage, formatDate } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/recruitment/candidates")({
  head: () => ({ meta: [{ title: "Candidates — Dverif" }] }),
  component: CandidatesPage,
});

const PAGE_SIZE = 20;

/**
 * Stage -> label key as an explicit lookup, not a template.
 *
 * `t(`recruitment.stageLabel.${c.stage}`)` would be shorter, but the i18n audit
 * script cannot see a computed key and would report all six as unreferenced — so a
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
 * returned page in the browser — otherwise selecting `rejected` on page 3 would show
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

  /** Every filter change returns to page 1 — see the same reasoning on claims. */
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
          <p className="text-xs text-muted-foreground">{c.email ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "opening",
      header: t("recruitment.opening"),
      render: (c) => <span className="text-sm">{c.opening_title ?? "—"}</span>,
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
      render: (c) => <span className="font-mono text-xs">{c.rating ?? "—"}</span>,
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
        <Button variant="ghost" size="sm" onClick={() => setViewing(c)}>
          <Eye className="mr-2 h-3.5 w-3.5" />
          {t("recruitment.resume")}
        </Button>
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

           "Page 1 of 1 · 3 results" with a greyed Previous and Next is noise that
           states nothing: both buttons are already disabled at the boundary, so the
           control communicates only that there is nothing to page through — which the
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
        open={adding}
        openings={openings.data ?? []}
        onOpenChange={setAdding}
        onDone={invalidate}
      />

      <CandidateSheet
        candidateUuid={viewing?.uuid ?? null}
        onOpenChange={(v) => !v && setViewing(null)}
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

function AddCandidateDialog({
  open,
  openings,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  openings: { uuid: string; title: string }[];
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();

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

  useEffect(() => {
    if (!open) return;
    reset({
      opening_uuid: openings[0]?.uuid ?? "",
      full_name: "",
      email: "",
      phone: "",
      cnic: "",
      cover_letter: "",
      notes: "",
    });
  }, [open, openings, reset]);

  const create = useMutation({
    mutationFn: (v: AddForm) =>
      candidatesService.create({
        opening_uuid: v.opening_uuid,
        full_name: v.full_name,
        // Empty -> undefined rather than "": an empty string is a supplied value and
        // would be stored as an email address of "" instead of a null.
        email: v.email.trim() || undefined,
        phone: v.phone.trim() || undefined,
        cnic: v.cnic.trim() || undefined,
        cover_letter: v.cover_letter || undefined,
        notes: v.notes || undefined,
      }),
    onSuccess: () => {
      onDone();
      onOpenChange(false);
      toast.success(t("recruitment.candidateCreated"));
    },
    // The duplicate-application case lands here: one row per candidate per opening is
    // enforced by a unique index, so re-adding the same person is a 409 the recruiter
    // needs told about rather than a form that appears to ignore them.
    onError: (e) => toast.error(apiErrorMessage(e, t("recruitment.candidateActionFailed"))),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      title={t("recruitment.newCandidate")}
      submitLabel={t("recruitment.save")}
      cancelLabel={t("recruitment.cancel")}
      onSubmit={(v) => create.mutate(v)}
    >
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.opening")}</span>
          <select
            {...form.register("opening_uuid", { required: true })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {openings.map((o) => (
              <option key={o.uuid} value={o.uuid}>
                {o.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.candidateName")}</span>
          <input
            {...form.register("full_name", { required: true })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.candidateEmail")}</span>
          <input
            type="email"
            {...form.register("email")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.candidatePhone")}</span>
          <input
            {...form.register("phone")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.candidateCnic")}</span>
          <input
            {...form.register("cnic")}
            inputMode="numeric"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.coverLetter")}</span>
          <textarea
            {...form.register("cover_letter")}
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
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
 * shown rather than uploaded here — attaching a file to someone's application is a
 * deliberate act that belongs on the row where the name is visible, not in a sheet
 * that slid over it.
 */
function CandidateSheet({
  candidateUuid,
  onOpenChange,
}: {
  candidateUuid: string | null;
  onOpenChange: (v: boolean) => void;
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
                <dd>{c.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("recruitment.candidatePhone")}</dt>
                <dd>{c.phone ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t("recruitment.candidateCnic")}</dt>
                <dd>{c.cnic ?? "—"}</dd>
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
                 * NOT `noCandidates`. That key is the list's empty state — "no
                 * candidates yet" — and reusing it inside the resume section said the
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
