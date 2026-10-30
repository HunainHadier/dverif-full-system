import { api, type Paginated } from "@/lib/api";
import type { UUID } from "./core";

/**
 * Drops `undefined` values from a merge-field payload.
 *
 * A merge tag resolves against the letter's values at render time, so an `undefined`
 * that survived into the payload printed the literal word "undefined" into a PDF that
 * had been issued with a real reference number — a document the candidate has already
 * been asked to sign. Null and empty string are left alone on purpose: a template may
 * genuinely want to print "none", and `""` renders as a blank rather than as text.
 */
function withoutUndefined(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as Record<
    string,
    string
  >;
}

/**
 * Recruitment client: openings, the candidate pipeline, interviews, offers.
 *
 * NO `status` ON ANY WRITE PAYLOAD. Pipeline stage is called `stage` and is only ever
 * set through `moveStage`, which is the one endpoint that models the transition — the
 * server refuses a move the allowed-transition table does not permit, and refuses
 * `hired` outright because arriving there also creates an employee record. A generic
 * `update({ status })` here would be a control the server silently ignores.
 *
 * `hire()` IS NOT `moveStage("hired")`, and the pair is kept as separate methods
 * because the difference is the whole module: one is a pipeline move, the other ends
 * up writing to the employee roster.
 */

export type CandidateStage =
  "applied" | "screening" | "interview" | "selected" | "offered" | "hired" | "declined" | "rejected";

/** The forward path. Rejection is reachable from anywhere but is not a step in it. */
export const PIPELINE_STAGES: CandidateStage[] = [
  "applied",
  "screening",
  "interview",
  "selected",
  "offered",
  "hired",
];

export type JobStatus = "draft" | "open" | "closed";

export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "temporary";

export type JobOpening = {
  uuid: UUID;
  title: string;
  department_id: number | null;
  designation_id: number | null;
  department_name?: string | null;
  designation_name?: string | null;
  location: string | null;
  employment_type: EmploymentType;
  description: string | null;
  status: JobStatus;
  vacancies: number;
  candidate_count: number;
  hired_count: number;
  in_progress_count?: number;
  vacancies_remaining?: number;
  created_at: string;
};

export type Candidate = {
  uuid: UUID;
  job_opening_uuid: UUID;
  opening_title?: string | null;
  full_name: string;
  email: string | null;
  /** True when this email already belongs to another candidate or org account. */
  email_duplicate?: boolean;
  phone: string | null;
  cnic: string | null;
  cover_letter?: string | null;
  stage: CandidateStage;
  rating: number | null;
  /** Staff-facing. Never sent to the public careers form. */
  notes: string | null;
  /** Why they left the pipeline. Surfaced on the board so a reject is legible later. */
  rejected_reason: string | null;
  /** Set once `hire` succeeds; the roster row this application became. */
  converted_employee_uuid: string | null;
  offer_letter_uuid: string | null;
  hired_at: string | null;
  offer_status?: "ready" | "sent" | "hired" | "draft" | "pending_approval" | "approved" | "accepted" | null;
  offer_sent_at?: string | null;
  offer_response_at?: string | null;
  offer_response_notes?: string | null;
  completed_interviews?: number;
  valid_interviews?: number;
  feedback_recorded_interviews?: number;
  created_at: string;
};

export type CandidateAttachment = {
  uuid: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  category: string | null;
  description: string | null;
  created_at: string;
};

export type CandidateDetail = Candidate & {
  opening: {
    uuid: UUID;
    title: string;
    location: string | null;
    employment_type: EmploymentType;
  } | null;
  interviews: Interview[];
  resumes: CandidateAttachment[];
  resume_count: number;
};

export type InterviewMode = "onsite" | "phone" | "video" | "other";

export type Interview = {
  uuid: UUID;
  candidate_uuid: UUID;
  candidate_name?: string | null;
  interviewer_uuid: string | null;
  interviewer_name?: string | null;
  interviewer_email?: string | null;
  interviewer_designation?: string | null;
  scheduled_at: string;
  mode: InterviewMode | null;
  location: string | null;
  feedback_notes: string | null;
  rating: number | null;
  /** scheduled | completed | cancelled */
  status: "scheduled" | "completed" | "cancelled";
  /** pending | passed | failed — orthogonal to status, so "met, deciding" is expressible. */
  outcome: "pending" | "passed" | "failed";
  created_at: string;
};

/** Offer lifecycle data shown on the recruitment offers screen. */
export type Offer = {
  candidate_uuid: UUID;
  full_name: string;
  email: string | null;
  cnic?: string | null;
  stage: CandidateStage;
  opening_title: string | null;
  reference_no: string | null;
  letter_status: "draft" | "issued" | "revoked" | null;
  letter_title: string | null;
  offer_letter_uuid: string | null;
  converted_employee_uuid: string | null;
  hired_at: string | null;
  offer_status?: "ready" | "sent" | "hired" | "draft" | "pending_approval" | "approved" | "accepted" | null;
  offer_sent_at?: string | null;
  offer_response_at?: string | null;
  issued_at: string | null;
  qr_token: string | null;
  verify_url: string | null;
  offer_template_uuid?: UUID | null;
  offer_values?: Record<string, string> | string | null;
  offer_body_snapshot?: string | null;
  offer_snapshot_hash?: string | null;
  feedback_recorded_interviews?: number;
};

export type PipelineBoard = {
  opening: JobOpening;
  columns: { stage: CandidateStage; count: number }[];
  rejected_count: number;
};

export const CANDIDATE_STAGE_VARIANT: Record<
  CandidateStage,
  "default" | "secondary" | "outline" | "destructive"
> = {
  applied: "outline",
  screening: "secondary",
  interview: "default",
  selected: "secondary",
  offered: "default",
  // `hired` is NOT destructive. A completed hire is the module working, and painting
  // it red makes a correctly-reimbursed, correctly-onboarded person look like a
  // problem. `rejected` is the only genuinely bad state.
  hired: "secondary",
  declined: "destructive",
  rejected: "destructive",
};

/** Offered is the last stage before money is promised, so it reads as the loudest good. */
export const JOB_STATUS_VARIANT: Record<JobStatus, "default" | "secondary" | "outline"> = {
  draft: "outline",
  open: "default",
  closed: "secondary",
};

/**
 * The create payload, named.
 *
 * Declared separately rather than inferred from `jobOpeningsService.create` inside
 * `update`, because `Parameters<typeof jobOpeningsService.update>` then refers back
 * to the object that contains it and TypeScript gives up with TS7022.
 */
export type JobOpeningInput = {
  title: string;
  department_id?: number | null;
  designation_id?: number | null;
  department_name?: string;
  designation_name?: string;
  location?: string;
  employment_type?: EmploymentType;
  description?: string;
  status?: JobStatus;
  vacancies?: number;
};

export const jobOpeningsService = {
  /**
   * PAGINATED, returning the full envelope — `items`, `total`, `page`, `totalPages` —
   * rather than the bare array this returned before.
   *
   * Two callers need the array (the openings table, and the pipeline's opening
   * picker), so `list` unwraps `.items` and `listPaginated` hands back the whole
   * envelope. The unwrapping is centralised here instead of at each call site
   * because a caller that forgot it would get a `Paginated` object typed as
   * `JobOpening[]` and fail at `.map`, well away from the change that caused it.
   */
  list: (status?: JobStatus) =>
    jobOpeningsService.listPaginated({ status }).then((r) => r.items ?? []),

  /**
   * The pager-bearing call. Use this wherever the total is needed; `list` is the
   * convenience form for callers that genuinely only want the rows.
   */
  listPaginated: (params: { status?: JobStatus; page?: number; limit?: number } = {}) =>
    api
      .get<Paginated<JobOpening>>("/org/job-openings", {
        params: { status: params.status || undefined, page: params.page, limit: params.limit },
      })
      .then((r) => r.data),

  get: (uuid: UUID) =>
    api.get<{ opening: JobOpening }>(`/org/job-openings/${uuid}`).then((r) => r.data.opening),

  create: (data: JobOpeningInput) =>
    api.post<{ opening: JobOpening }>("/org/job-openings", data).then((r) => r.data.opening),

  update: (uuid: UUID, data: Partial<JobOpeningInput>) =>
    api.put<{ opening: JobOpening }>(`/org/job-openings/${uuid}`, data).then((r) => r.data.opening),
};

export const candidatesService = {
  list: (
    params: {
      page?: number;
      limit?: number;
      opening_uuid?: UUID;
      stage?: CandidateStage;
      search?: string;
    } = {},
  ) =>
    api
      .get<Paginated<Candidate>>("/org/candidates", {
        params: { ...params, search: params.search || undefined, stage: params.stage || undefined },
      })
      .then((r) => r.data),

  get: (uuid: UUID) =>
    api
      .get<{ candidate: CandidateDetail }>(`/org/candidates/${uuid}`)
      .then((r) => r.data.candidate),

  /**
   * The candidate's interview history, from the SAME endpoint as the agenda.
   *
   * A per-candidate history is small, but it is paged like everything else so a
   * candidate interviewed forty times cannot be the reason a page hangs. `limit: 100`
   * is above the server's cap of 100, so it means "as many as allowed" rather than
   * silently asking for more than the server will give.
   */
  forCandidate: (candidateUuid: UUID) =>
    api
      .get<Paginated<Interview>>("/org/interviews", {
        params: { candidate_uuid: candidateUuid, limit: 100 },
      })
      .then((r) => r.data.items ?? []),

  /**
   * File an application on someone's behalf.
   *
   * Takes an employee_uuid because this is the STAFF client — someone in HR entering
   * an application for a walk-in. The public careers form has its own path that cannot
   * supply one at all, which is why the two are separate clients rather than one with
   * an optional field.
   */
  create: (data: {
    opening_uuid: UUID;
    full_name: string;
    email?: string;
    phone?: string;
    cnic?: string;
    cover_letter?: string;
    notes?: string;
  }) => api.post<{ candidate: Candidate }>("/org/applications", data).then((r) => r.data.candidate),

  update: (uuid: UUID, data: {
    full_name: string;
    email: string;
    phone?: string;
    cnic?: string;
    cover_letter?: string;
    notes?: string;
  }) => api.put<{ candidate: Candidate }>(`/org/candidates/${uuid}`, data).then((r) => r.data.candidate),

  /**
   * Move along the pipeline.
   *
   * `hired` is deliberately not accepted by the type as a plain move: arriving there
   * requires creating an employee row, so it goes through hire() below. The server
   * refuses it here too — the two agree rather than one silently accepting what the
   * other rejects.
   */
  moveStage: (
    uuid: UUID,
    data: {
      stage: Exclude<CandidateStage, "hired">;
      rejection_reason?: string;
      rating?: number | null;
      notes?: string;
    },
  ) =>
    api
      .post<{ candidate: Candidate }>(`/org/applications/${uuid}/move-stage`, data)
      .then((r) => r.data.candidate),

  /**
   * Prepare and save an offer that is immediately ready to send.
   */
  prepareOffer: (uuid: UUID, data: { offer_template_uuid: UUID; offer_values: Record<string, string> }) =>
    api.post<{ candidate: Candidate }>(`/org/applications/${uuid}/start-offer`, data)
      .then((r) => r.data),
  prepareOfferWithInterviewOverride: (uuid: UUID, data: { reason: string; offer_template_uuid: UUID; offer_values: Record<string, string> }) =>
    api.post<{ candidate: Candidate }>(`/org/applications/${uuid}/start-offer/override`, {
      override_failed_interview_reason: data.reason,
      offer_template_uuid: data.offer_template_uuid,
      offer_values: data.offer_values,
    }).then((r) => r.data),


  uploadResume: (uuid: UUID, files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return api
      .post<{ items: CandidateAttachment[] }>(`/org/candidates/${uuid}/resume`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data.items ?? []);
  },

  /**
   * Preview a CV and read back whatever the document service can extract from it.
   *
   * NOT AN UPLOAD of the resume itself — this is a two-step flow on purpose. The
   * recruiter drops a file, sees what was read, corrects it, and only presses
   * Save once; `uploadResume` then attaches the same file to the candidate row
   * that step creates. Sending the file twice is the cost of the recruiter being
   * able to review before it becomes a record, and a CV that was OCR'd badly
   * becomes a permanent attachment with a name typed from the bad read.
   *
   * Confidence comes back per field and drives the UI's "check this" indicator:
   * the extraction is a machine reading a document a human wrote for a human, so
   * "Muhammad" arriving from a font that rendered double-l is ordinary, not an
   * edge case. Only fields that were actually found are returned; a null is the
   * honest state for a CV that does not print that value.
   */
  parseResume: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post<{
        fields: {
          name: string | null;
          name_confidence: "high" | "low" | "not_visible" | null;
          cnic: string | null;
          cnic_confidence: "high" | "low" | "not_visible" | null;
          designation: string | null;
          designation_confidence: "high" | "low" | "not_visible" | null;
          email: string | null;
          email_confidence: "high" | "low" | "not_visible" | null;
          phone: string | null;
          phone_confidence: "high" | "low" | "not_visible" | null;
        };
      }>("/org/resume/parse", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data.fields);
  },
};

export const interviewsService = {
  interviewers: () =>
    api
      .get<{ items?: { uuid: UUID; full_name: string; email: string; org_role: string; designation: string | null; department: string | null }[] }>("/org/interviewers")
      .then((r) => Array.isArray(r.data?.items) ? r.data.items : []),

  myAssigned: (params: { page?: number; limit?: number } = {}) =>
    api.get<Paginated<Interview>>("/org/my/interviews", { params: { ...params, limit: params.limit ?? 100 } }).then((r) => r.data.items ?? []),

  recordMyFeedback: (
    uuid: UUID,
    data: { status?: "completed" | "cancelled"; outcome?: "pending" | "passed" | "failed"; rating?: number | null; feedback_notes?: string },
  ) => api.post<{ interview: Interview }>(`/org/my/interviews/${uuid}/feedback`, data).then((r) => r.data.interview),

  /**
   * PAGINATED, and now genuinely necessary where it was not before.
   *
   * This was previously unpaginated on the reasoning that the agenda is "a screen at
   * most". That holds for a new org and stops holding after a year: an org that has
   * run recruitment for a year has thousands of COMPLETED interviews, and the
   * unfiltered call this page makes would fetch every one of them to show the handful
   * that are still upcoming.
   *
   * THE LIMIT IS 100, THE SERVER'S MAXIMUM, AND THAT IS THE POINT. The server orders
   * `scheduled_at DESC`, so an agenda's first page is the most recent interviews —
   * which is what makes page 1 contain today's meeting rather than page 40. The page
   * splits upcoming from past client-side within that one page; the split is a
   * function of when you are looking, so it cannot be a stored column or a server
   * filter.
   *
   * NOTE FOR LATER: once an org's interview history outgrows 100, this page needs real
   * pagination controls. Until then a silent cap is better than an unbounded fetch,
   * but it will eventually hide rows with no indication that it has — `listPaginated`
   * is here so that is a one-line change when it is needed.
   */
  list: (
    params: { candidate_uuid?: UUID; interviewer_uuid?: UUID; page?: number; limit?: number } = {},
  ) =>
    api
      .get<Paginated<Interview>>("/org/interviews", {
        params: { ...params, limit: params.limit ?? 100 },
      })
      .then((r) => r.data.items ?? []),

  listPaginated: (
    params: { candidate_uuid?: UUID; interviewer_uuid?: UUID; page?: number; limit?: number } = {},
  ) =>
    api
      .get<Paginated<Interview>>("/org/interviews", {
        params: { ...params, limit: params.limit ?? 100 },
      })
      .then((r) => r.data),

  schedule: (data: {
    candidate_uuid: UUID;
    interviewer_uuid: UUID;
    scheduled_at: string;
    mode?: InterviewMode;
    location?: string;
  }) => api.post<{ interview: Interview }>("/org/interviews", data).then((r) => r.data.interview),

  /**
   * `pending` IS A VALID SUBMISSION here, and omitting it from this type was wrong.
   *
   * The server accepts pending/passed/failed and coerces anything missing to
   * `pending` for a completed interview, so the client's narrower union forced the
   * dialog into a fiction: a reviewer who met the candidate and wants to record
   * notes WITHOUT committing to pass or fail — the most common state at the end of a
   * first interview — had no value to send, so it was told to send "passed" or
   * "failed" when the honest answer was neither yet.
   */
  recordFeedback: (
    uuid: UUID,
    data: {
      status?: "completed" | "cancelled";
      /** pending = met, not yet decided. The server's own default for completed. */
      outcome?: "pending" | "passed" | "failed";
      rating?: number | null;
      feedback_notes?: string;
    },
  ) =>
    api
      .post<{ interview: Interview }>(`/org/interviews/${uuid}/feedback`, data)
      .then((r) => r.data.interview),
};

export type OfferPreparation = {
  candidate: { uuid: UUID; full_name: string; email: string | null; cnic: string | null; final_interview_outcome: "passed" | "failed" | null };
  opening: { uuid: UUID; title: string; designation: string | null; department: string | null };
  templates: { uuid: UUID; name: string; letter_type: string; body: string; merge_fields: string[]; is_active: number }[];
  merge_tags: { tag: string; label: string; source: string; help: string; letter_types: string[] }[];
  default_values: Record<string, string>;
  selected_template_uuid: UUID | null;
};
export type OfferPreview = {
  template_uuid: UUID;
  template_name: string;
  values: Record<string, string>;
  rendered_body: string;
  unresolved: string[];
  unknown: string[];
  required_tags: string[];
  missing_fields: { tag: string; label: string; source: string }[];
};

export const offersService = {
  /**
   * HIRED candidates only — see `Offer`. Not paginated against a filter the UI does
   * not offer, but `page`/`limit` are forwarded because the endpoint paginates and a
   * growing org will need paging eventually; dropping them would mean a silent
   * behaviour change the day the endpoint started enforcing a default page size.
   */
  list: (params: { page?: number; limit?: number; opening_uuid?: UUID } = {}) =>
    api.get<Paginated<Offer>>("/org/offers", { params }).then((r) => r.data),

  /** Prepare and preview the candidate's offer letter. */
  prepare: (candidateUuid: UUID) => api.get<OfferPreparation>(`/org/offers/${candidateUuid}/prepare`).then((r) => r.data),
  preview: (candidateUuid: UUID, data: { template_uuid: UUID; values: Record<string, string> }) =>
    api.post<OfferPreview>(`/org/offers/${candidateUuid}/preview`, data).then((r) => r.data),

  /** Send the prepared offer directly to the candidate's email address. */
  send: (candidateUuid: UUID) =>
    api.post<{ candidate_uuid: UUID; status: "sent" }>("/org/offers/" + candidateUuid + "/send", {}).then((r) => r.data),
  downloadPdf: (candidateUuid: UUID) =>
    api.get(`/org/offers/${candidateUuid}/pdf`, { responseType: "blob" }).then((r) => r.data as Blob),
  /** Mark the candidate as hired and create their employee record. */
  hire: (candidateUuid: UUID, data: { cnic?: string | null; email?: string; joining_date?: string; comments?: string } = {}) =>
    api.post<{ candidate: Candidate; employee_uuid: UUID | null }>(
      "/org/offers/" + candidateUuid + "/hire",
      data,
    ).then((r) => r.data),
};

/** The Kanban read: columns with counts for one opening. */
export const pipelineService = {
  board: (openingUuid: UUID) =>
    api.get<PipelineBoard>(`/org/pipeline/${openingUuid}`).then((r) => r.data),
};
