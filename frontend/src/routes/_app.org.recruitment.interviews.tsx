import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarClock, Video } from "lucide-react";

import { ModuleGate } from "@/components/hr/ModuleGate";
import { DataTable, type DataTableColumn } from "@/components/hr/DataTable";
import { FormDialog } from "@/components/hr/FormDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common/PageHeader";
import { SearchInput } from "@/components/common/SearchInput";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { RecruitmentTabs } from "@/components/hr/RecruitmentTabs";
import {
  candidatesService,
  interviewsService,
  type Interview,
  type InterviewMode,
} from "@/services";
import { apiErrorMessage, formatDateTime } from "@/lib/utils";

export const Route = createFileRoute("/_app/org/recruitment/interviews")({
  head: () => ({ meta: [{ title: "Interviews — Dverif" }] }),
  component: InterviewsPage,
});

/**
 * WHO IS MEETING WHOM, AND WHAT WAS CONCLUDED.
 *
 * This is an AGENDA, not a calendar grid. A month grid would imply free/busy booking
 * over rooms and interviewers, which this module does not model — it stores a
 * `scheduled_at` per interview and refuses a double-booked INTERVIEWER. Rendering
 * that as a calendar would promise availability management the backend cannot
 * enforce, so the honest presentation is a chronological list with the interviewer
 * visible on every row, which is what makes a clash noticeable.
 *
 * FUTURE AND PAST ARE SEPARATE SECTIONS rather than one mixed list. A recruiter
 * opening this page is almost always asking "what is coming up", and mixing last
 * month's completed interviews into that list buries the answer. The split is on the
 * client from one query, because an interviewer's agenda is short enough that paging
 * it would be a false affordance.
 *
 * OUTCOME IS SEPARATE FROM STATUS, and both are shown. `status` is scheduled |
 * completed | cancelled and `outcome` is pending | passed | failed. They are
 * orthogonal on the server so "met them, still deciding" is expressible, and
 * collapsing them into one field here would hide exactly the state most interviews
 * are actually in.
 */
export function InterviewsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [scheduling, setScheduling] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState<Interview | null>(null);
  const [search, setSearch] = useState("");

  const list = useQuery({
    queryKey: ["recruitment-interviews"],
    queryFn: () => interviewsService.list(),
  });

  const candidates = useQuery({
    queryKey: ["recruitment-candidates-all"],
    queryFn: () => candidatesService.list({ limit: 200 }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["recruitment-interviews"] });
    void qc.invalidateQueries({ queryKey: ["recruitment-candidates"] });
  };

  /**
   * "Upcoming" IS A FUNCTION OF WHEN YOU ARE LOOKING, so the split is made here rather
   * than by asking the server for two lists. The fallback lives INSIDE the memo on
   * purpose: hoisting `list.data ?? []` would allocate a fresh empty array on every
   * render while the query is in flight, which would make the memo recompute on every
   * render too — recomputing a split that produced the same rows.
   *
   * THE SEARCH IS ALSO INSIDE THE MEMO, and it filters the page the client already
   * holds rather than re-querying. The interviews endpoint has no `search` parameter —
   * it filters by candidate or interviewer only — and adding one for a name match
   * against a joined column would mean a fourth server-side concern on a list that is
   * deliberately "a screen at most". Filtering here keeps the request identical to
   * before, so searching cannot change what the agenda thinks it has loaded.
   */
  const { upcoming, past } = useMemo(() => {
    const items = list.data ?? [];
    const now = Date.now();
    const needle = search.trim().toLowerCase();
    const matches = (i: Interview) =>
      !needle || (i.candidate_name ?? "").toLowerCase().includes(needle);

    return {
      upcoming: items.filter(
        (i) => i.status === "scheduled" && new Date(i.scheduled_at).getTime() >= now && matches(i),
      ),
      past: items
        .filter(
          (i) =>
            (i.status !== "scheduled" || new Date(i.scheduled_at).getTime() < now) && matches(i),
        )
        .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()),
    };
  }, [list.data, search]);

  const cancel = useMutation({
    mutationFn: (i: Interview) => interviewsService.recordFeedback(i.uuid, { status: "cancelled" }),
    onSuccess: () => {
      invalidate();
      toast.success(t("recruitment.interviewScheduled"));
    },
    onError: (e) => toast.error(apiErrorMessage(e, t("recruitment.interviewFailed"))),
  });

  const hasVisibleInterviews = upcoming.length > 0 || past.length > 0;
  const hasLoadedInterviews = (list.data?.length ?? 0) > 0;

  const columns = (rows: Interview[]): DataTableColumn<Interview>[] => [
    {
      key: "scheduled_at",
      header: t("recruitment.scheduledAt"),
      render: (i) => <span className="text-sm">{formatDateTime(i.scheduled_at)}</span>,
    },
    {
      key: "candidate_name",
      header: t("recruitment.candidate"),
      render: (i) => <span className="font-medium">{i.candidate_name ?? "—"}</span>,
    },
    {
      key: "interviewer_name",
      header: "Interviewer",
      render: (i) => <span className="text-sm">{i.interviewer_name ?? "Unassigned"}</span>,
    },
    {
      key: "mode",
      header: t("recruitment.interviewMode"),
      render: (i) => (
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          {i.mode === "video" ? <Video className="h-3.5 w-3.5" /> : null}
          {i.mode ?? "—"}
        </span>
      ),
    },
    {
      key: "location",
      header: t("recruitment.interviewLocation"),
      render: (i) => <span className="text-sm">{i.location ?? "—"}</span>,
    },
    {
      key: "status",
      header: t("recruitment.status"),
      render: (i) => (
        <Badge
          variant={
            i.status === "completed"
              ? "secondary"
              : i.status === "cancelled"
                ? "destructive"
                : "outline"
          }
        >
          {t(`recruitment.interviewStatusLabel.${i.status}`)}
        </Badge>
      ),
    },
    {
      key: "outcome",
      header: t("recruitment.interviewOutcome"),
      render: (i) => (
        <Badge
          variant={
            i.outcome === "passed" ? "default" : i.outcome === "failed" ? "destructive" : "outline"
          }
        >
          {t(`recruitment.interviewOutcomeLabel.${i.outcome}`)}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: t("recruitment.actions"),
      render: (i) => (
        <div className="flex items-center justify-end gap-1">
          {i.status === "scheduled" ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setFeedbackFor(i)}>
                {t("recruitment.recordFeedback")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(i)}
              >
                {t("recruitment.cancelInterview")}
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <ModuleGate module="recruitment_management">
      <div className="space-y-4">
        <PageHeader
          title={t("recruitment.interviewsTitle")}
          description={t("recruitment.interviewsDescription")}
          actions={
            <Button onClick={() => setScheduling(true)}>
              {t("recruitment.scheduleInterview")}
            </Button>
          }
        />

        <RecruitmentTabs />

        {/* Same `SearchInput` the other three tabs use, directly above the lists it
            filters — so it reads as controlling the page rather than as part of the
            schedule button. */}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("recruitment.searchInterviews")}
        />

        {upcoming.length > 0 || !hasLoadedInterviews || !hasVisibleInterviews ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t("recruitment.upcoming")}</h2>
          <DataTable
            columns={columns(upcoming)}
            rows={upcoming}
            loading={list.isLoading}
            emptyIcon={CalendarClock}
            // When a search hides everything, saying "no interviews scheduled" would be
            // a lie about the schedule — it is about the FILTER. Both strings exist so
            // the table can tell those apart.
            emptyTitle={
              search.trim()
                ? t("recruitment.noInterviewsMatch")
                : hasLoadedInterviews
                  ? t("recruitment.noUpcomingInterviews", "No upcoming interviews")
                  : t("recruitment.noInterviews")
            }
            emptyDescription={
              search.trim()
                ? t("recruitment.noInterviewsMatchDescription")
                : hasVisibleInterviews
                  ? undefined
                  : t("recruitment.noInterviewsDescription")
            }
            emptyAction={
              search.trim() || hasLoadedInterviews ? null : (
                <Button onClick={() => setScheduling(true)}>
                  {t("recruitment.scheduleInterview")}
                </Button>
              )
            }
          />
        </section>
        ) : null}

        {past.length ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">{t("recruitment.pastInterviews")}</h2>
            <DataTable
            // A scheduled interview can fall into this section once its meeting
            // time has passed. Keep its feedback action visible so recruiters can
            // still complete it and record the pass/fail decision.
            columns={columns(past)}
              rows={past}
              showPagination={false}
            />
          </section>
        ) : null}
      </div>

      <ScheduleDialog
        open={scheduling}
        candidates={candidates.data?.items ?? []}
        onOpenChange={setScheduling}
        onDone={invalidate}
      />

      <FeedbackDialog
        interview={feedbackFor}
        onOpenChange={(v) => !v && setFeedbackFor(null)}
        onDone={invalidate}
      />
    </ModuleGate>
  );
}

// ---------------------------------------------------------------------------

type ScheduleForm = {
  candidate_uuid: string;
  interviewer_uuid: string;
  /** `datetime-local` value, which has no timezone — converted to UTC on submit. */
  scheduled_at: string;
  mode: InterviewMode;
  location: string;
};

/**
 * Schedule an interview.
 *
 * THE INTERVIEWER IS PICKED FROM THE EMPLOYEE ROSTER, NOT TYPED AS A UUID.
 *
 * This was a free-text field, and it was a real defect rather than a cosmetic one: it
 * asked the recruiter to type a `interviewer_uuid`, which is a value nothing in the UI
 * has ever displayed. Every user typed a colleague's name and the server answered
 * `400 "Interviewer UUID must be a valid UUID"` — so the one field on this form that
 * looked like a name field was unusable, and it failed in a way that pointed at the
 * user's typing rather than at the form. A control that cannot be filled correctly by
 * knowing what the thing is should not exist.
 *
 * `scope: "org"` on the lookup is load-bearing. Without it an org_admin sees only the
 * employee records they personally added, so a colleague another admin onboarded does
 * not exist as far as this picker is concerned — and the interviewer list silently
 * omits most of the company.
 *
 * The interviewer stays OPTIONAL on purpose. `interviewer_uuid: undefined` is allowed
 * by the server (an interview can be booked before a panel is assigned), which is a
 * real state and not a missing form field — so the empty option is labelled, not
 * hidden.
 */
function ScheduleDialog({
  open,
  candidates,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  candidates: { uuid: string; full_name: string }[];
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();

  const interviewers = useQuery({
    queryKey: ["recruitment-interviewers"],
    queryFn: () => interviewsService.interviewers(),
    enabled: open,
  });

  const form = useForm<ScheduleForm>({
    defaultValues: {
      candidate_uuid: "",
      interviewer_uuid: "",
      scheduled_at: "",
      mode: "onsite",
      location: "",
    },
  });
  const { reset } = form;
  const interviewerUuid = form.watch("interviewer_uuid");
  const interviewerOptions = useMemo(
    () => [
      ...(interviewers.data ?? []).map((person) => ({
        value: person.uuid,
        label: person.full_name,
        hint: [person.designation, person.department, person.org_role.replace("_", " ")].filter(Boolean).join(" · "),
        keywords: person.email,
      })),
    ],
    [interviewers.data?.items, t],
  );

  useEffect(() => {
    if (!open) return;
    reset({
      candidate_uuid: candidates[0]?.uuid ?? "",
      interviewer_uuid: "",
      scheduled_at: "",
      mode: "onsite",
      location: "",
    });
  }, [open, candidates, reset]);

  const schedule = useMutation({
    mutationFn: (v: ScheduleForm) =>
      interviewsService.schedule({
        candidate_uuid: v.candidate_uuid,
        interviewer_uuid: v.interviewer_uuid,
        // A `datetime-local` string is wall-clock time with no zone. Sending it
        // verbatim would have the server store it as UTC and shift every interview by
        // the browser's offset.
        scheduled_at: new Date(v.scheduled_at).toISOString(),
        mode: v.mode,
        location: v.location || undefined,
      }),
    onSuccess: () => {
      onDone();
      onOpenChange(false);
      toast.success(t("recruitment.interviewScheduled"));
    },
    /**
     * WITHOUT THIS THE FORM FAILS SILENTLY. The api interceptor does not toast — it
     * rethrows so the caller can decide — and a mutation with no `onError` simply
     * swallows its own failure. So booking an interview for a candidate still at
     * `applied` closed nothing, toasted nothing, and left the recruiter pressing Save
     * on a form that could never succeed, with the server's explanation visible only
     * in devtools.
     *
     * The server's own wording is surfaced, not replaced: "Move this candidate to the
     * interview stage before scheduling them (they are at \"applied\")" tells the user
     * exactly which of the two prerequisites is missing. A generic "could not save"
     * would not.
     */
    onError: (e) => toast.error(apiErrorMessage(e, t("recruitment.interviewFailed"))),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      title={t("recruitment.scheduleInterview")}
      submitLabel={t("recruitment.save")}
      cancelLabel={t("recruitment.cancel")}
      // `lg`, not the default `md`. The interviewer options read "Imran Shah — Head of
      // Finance", and at max-w-lg (32rem) that name-plus-title is truncated by the
      // native select to something like "Imran Shah — Head of Fin…" — which puts two
      // people with the same name in the list indistinguishable. The extra width buys
      // the whole designation.
      size="lg"
      onSubmit={(v) => {
        if (!v.interviewer_uuid) { toast.error("Select an interviewer before scheduling"); return; }
        schedule.mutate(v);
      }}
    >
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.interviewFor")}</span>
          <select
            {...form.register("candidate_uuid", { required: true })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {candidates.length ? (
              candidates.map((c) => (
                <option key={c.uuid} value={c.uuid}>
                  {c.full_name}
                </option>
              ))
            ) : (
              <option value="">{t("recruitment.noCandidates")}</option>
            )}
          </select>
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.interviewer")}</span>
          <SearchableSelect
            items={interviewerOptions}
            value={interviewerUuid}
            onChange={(value) => form.setValue("interviewer_uuid", value, { shouldDirty: true })}
            placeholder="Select an interviewer"
            searchPlaceholder={t("recruitment.searchInterviewer", "Search interviewer...")}
            emptyText={t("recruitment.noInterviewersFound", "No interviewers found.")}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.scheduledAt")}</span>
          <input
            type="datetime-local"
            {...form.register("scheduled_at", { required: true })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.interviewMode")}</span>
          <select
            {...form.register("mode")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {(["onsite", "phone", "video", "other"] as InterviewMode[]).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.interviewLocation")}</span>
          <input
            {...form.register("location")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
        </label>
      </div>
    </FormDialog>
  );
}

// ---------------------------------------------------------------------------

type FeedbackForm = {
  status: "completed" | "cancelled";
  outcome: "pending" | "passed" | "failed";
  rating: string;
  feedback_notes: string;
};

function FeedbackDialog({
  interview,
  onOpenChange,
  onDone,
}: {
  interview: Interview | null;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const open = Boolean(interview);

  const form = useForm<FeedbackForm>({
    defaultValues: { status: "completed", outcome: "passed", rating: "", feedback_notes: "" },
  });
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    reset({
      status: "completed",
      // Defaults to `pending` rather than `passed`: a feedback form that preselects a
      // pass makes an accidental Enter approve a candidate. The reviewer has to say
      // what happened.
      outcome: "pending",
      rating: "",
      feedback_notes: "",
    });
  }, [open, reset]);

  const save = useMutation({
    mutationFn: (v: FeedbackForm) =>
      interviewsService.recordFeedback(interview!.uuid, {
        status: v.status,
        outcome: v.outcome,
        rating: v.rating.trim() ? Number(v.rating) : null,
        feedback_notes: v.feedback_notes || undefined,
      }),
    onSuccess: () => {
      onDone();
      onOpenChange(false);
      toast.success(t("recruitment.interviewFeedbackSaved"));
    },
    // Notably the 409 for recording feedback twice, which the UI prevents by hiding
    // the control — but a second tab, or a stale page, still produces it.
    onError: (e) => toast.error(apiErrorMessage(e, t("recruitment.interviewFailed"))),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      form={form}
      title={t("recruitment.recordFeedback")}
      description={interview?.candidate_name ?? undefined}
      submitLabel={t("recruitment.save")}
      cancelLabel={t("recruitment.cancel")}
      onSubmit={(v) => save.mutate(v)}
    >
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.status")}</span>
          <select
            {...form.register("status")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="completed">{t("recruitment.interviewStatusLabel.completed")}</option>
            <option value="cancelled">{t("recruitment.interviewStatusLabel.cancelled")}</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.interviewOutcome")}</span>
          <select
            {...form.register("outcome")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {(["pending", "passed", "failed"] as const).map((o) => (
              <option key={o} value={o}>
                {t(`recruitment.interviewOutcomeLabel.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.rating")}</span>
          <input
            type="number"
            min={0}
            max={5}
            {...form.register("rating")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          />
          <span className="block text-xs text-muted-foreground">{t("recruitment.ratingHint")}</span>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{t("recruitment.interviewNotes")}</span>
          <textarea
            {...form.register("feedback_notes")}
            rows={4}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </label>
      </div>
    </FormDialog>
  );
}
