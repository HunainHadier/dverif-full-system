import { randomUUID, createHash } from "node:crypto";
import ApiError from "../utils/ApiError.js";
import { pool } from "../config/db.js";
import { assertUuid } from "../utils/publicResponse.js";
import { isoDate } from "../utils/dateRange.js";
import { logAudit } from "../utils/auditLog.js";
import * as attachments from "./attachments.service.js";
import { getTemplate, listTemplates } from "./hrLetters.service.js";
import { renderTemplate, validateBody, tagsForLetterType, tagLabel, unsupportedTags } from "../utils/letterMerge.js";
import { sendRecruitmentOfferEmail } from "../utils/mailer.js";
import { ocrExtract } from "./documentService.js";

/**
 * Applicant tracking: openings, candidates, interviews.
 *
 * WHY THIS MODULE IS SHAPED THE WAY IT IS
 *
 * HIRING IS THE ONE PROCESS WHERE THE DATA IS NOT YET AN EMPLOYEE. Every other
 * HR module in this system operates on `employees`, which assumes the person is
 * already here. A candidate has a name and an email and nothing else: no employee
 * uuid, no department, no joining date. So this module deliberately keeps its own
 * tables instead of writing placeholder employee rows early — a placeholder that
 * reached payroll, the attendance register and the asset list would be counted as
 * a person who had not been offered a job yet.
 *
 * THE ONE-SHOT CONVERSION
 *
 * The irreversible step is `hired`, which creates a real employee. It is one
 * button, reachable by anyone who can see the pipeline, and two recruiters
 * clicking it on the same candidate at the same moment would otherwise produce two
 * employee records and one human counted twice in payroll. Three things prevent
 * it:
 *
 *   - the UPDATE asserts `converted_employee_uuid IS NULL AND stage = 'offered'`,
 *     so of two concurrent hires exactly one matches a row;
 *   - the employee row and the offer letter are written in ONE transaction, so a
 *     failure in either leaves neither;
 *   - `converted_employee_uuid` records which employee a candidate became, so the
 *     link is auditable in both directions and `hired` is terminal.
 *
 * `hired` IS TERMINAL. Re-hiring a rejected-then-reinstated candidate is not a
 * thing this module supports, and pretending otherwise would mean an existing
 * employee has two origins and two sets of audit history.
 */

/** Attachment entity type for resumes. Matches the attachments migration's example. */
export const ATTACHMENT_ENTITY = { CANDIDATE: "candidate" };
export const ATTACHMENT_CATEGORY = { RESUME: "candidate_resume" };

export const CANDIDATE_STAGES = [
  "applied",
  "screening",
  "interview",
  "selected",
  "offered",
  "hired",
  "declined",
  "rejected",
];

/** The forward path a candidate walks. `rejected` is reachable from any live stage. */
export const PIPELINE_FLOW = ["applied", "screening", "interview", "selected", "offered", "hired"];

export const JOB_STATUSES = ["draft", "open", "closed"];
export const EMPLOYMENT_TYPES = [
  "full_time",
  "part_time",
  "contract",
  "internship",
  "temporary",
];
export const INTERVIEW_STATUSES = ["scheduled", "completed", "cancelled"];

/**
 * How far back a candidate's experience may reach, in days.
 *
 * Not a schema constraint so it can be changed without a migration. It exists
 * mainly to keep the careers form honest: a "15 years of experience" field is the
 * one number applicants most often inflate.
 */
export const MAX_EXPERIENCE_YEARS = 40;

function money(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return v === 0 ? 0 : v;
}

/** rating is 0..5. Quoted everywhere because RATING is reserved in MySQL 8. */
function ratingOrNull(value, label = "rating") {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 5) {
    throw new ApiError(400, `${label} must be between 0 and 5`);
  }
  return money(n);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function isValidDateTime(value) {
  if (!value) return false;
  // mysql2 will happily accept "not a date" and store it as 0000-00-00, which
  // silently destroys the only ordering the interview list has.
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

// ===========================================================================
// Job openings
// ===========================================================================

/**
 * Load an opening, proving it belongs to THIS organization.
 *
 * Every read goes through here. The composite tenant foreign keys on the table make
 * it impossible to point an opening at another org's department, but nothing stops
 * a caller naming another org's OPENING uuid, and that is this function's job.
 */
export async function loadOpening({ orgId, openingUuid, conn = pool, requireStatus = null }) {
  assertUuid(openingUuid, "Job opening UUID");
  const [rows] = await conn.query(
    `SELECT * FROM job_openings
      WHERE uuid=? AND organization_id=?${requireStatus ? " AND status=?" : ""}`,
    requireStatus ? [openingUuid, orgId, requireStatus] : [openingUuid, orgId]
  );
  if (!rows.length) throw new ApiError(404, "Job opening not found in this organization");
  return rows[0];
}

/**
 * A department or designation must belong to this org.
 *
 * The database refuses a mismatched pair too, but only as a raw MySQL error at
 * INSERT time. Checking here means the recruiter is told which field is wrong.
 */
async function assertOrgOwnedId({ orgId, table, id, label, conn }) {
  if (id === undefined || id === null || id === "") return null;
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new ApiError(400, `${label} must be a valid id`);
  }
  const [rows] = await conn.query(
    `SELECT id FROM ${table} WHERE id=? AND organization_id=?`,
    [numeric, orgId]
  );
  if (!rows.length) {
    // 404 rather than 403: a department in another organization should be
    // indistinguishable from one that does not exist.
    throw new ApiError(404, `${label} not found in this organization`);
  }
  return numeric;
}

export async function createOpening({
  orgId,
  actorUuid,
  title,
  departmentId,
  designationId,
  location,
  employmentType = "full_time",
  description,
  status = "draft",
  vacancies = 1,
  conn = pool,
}) {
  if (!title || !String(title).trim()) throw new ApiError(400, "title is required");
  if (!JOB_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${JOB_STATUSES.join(", ")}`);
  }
  if (!EMPLOYMENT_TYPES.includes(employmentType)) {
    throw new ApiError(400, `employment_type must be one of: ${EMPLOYMENT_TYPES.join(", ")}`);
  }
  const seats = Number(vacancies);
  if (!Number.isInteger(seats) || seats < 1) {
    // 0 would mean "a vacancy that cannot be filled", which is not a thing; the
    // honest way to stop recruiting is status='closed'.
    throw new ApiError(400, "vacancies must be a positive whole number");
  }

  const department_id = await assertOrgOwnedId({
    orgId,
    table: "departments",
    id: departmentId,
    label: "Department",
    conn,
  });
  const designation_id = await assertOrgOwnedId({
    orgId,
    table: "designations",
    id: designationId,
    label: "Designation",
    conn,
  });

  const uuid = randomUUID();
  await conn.query(
    `INSERT INTO job_openings
       (uuid, organization_id, title, department_id, designation_id, location,
        employment_type, description, status, vacancies, created_by_uuid, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      uuid,
      orgId,
      String(title).trim(),
      department_id,
      designation_id,
      location ? String(location).trim() : null,
      employmentType,
      description ? String(description).trim() : null,
      status,
      seats,
      actorUuid ?? null,
    ]
  );

  logAudit({
    actorType: "user",
    actorId: actorUuid ?? null,
    action: "job_opening.create",
    entityType: "job_opening",
    entityId: uuid,
    details: { title: String(title).trim(), status, vacancies: seats },
  });

  return getOpening({ orgId, openingUuid: uuid, conn });
}

export async function getOpening({ orgId, openingUuid, conn = pool }) {
  const opening = await loadOpening({ orgId, openingUuid, conn });
  const [counts] = await conn.query(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN stage='hired' THEN 1 ELSE 0 END) AS hired,
            SUM(CASE WHEN stage NOT IN ('hired','rejected') THEN 1 ELSE 0 END) AS in_progress
       FROM candidates WHERE organization_id=? AND job_opening_uuid=?`,
    [orgId, openingUuid]
  );

  const row = counts[0] ?? {};
  const hired = Number(row.hired ?? 0);

  return {
    ...opening,
    // Read back through isoDate(), never toISOString(): mysql2 builds a DATE at
    // local midnight, so on this server (UTC+5) a joining date arrives as the
    // previous day and every hire would be filed under the wrong day.
    designation_id: opening.designation_id ?? null,
    department_id: opening.department_id ?? null,
    candidate_count: Number(row.total ?? 0),
    hired_count: hired,
    in_progress_count: Number(row.in_progress ?? 0),
    vacancies_remaining: Math.max(0, Number(opening.vacancies ?? 1) - hired),
  };
}

/**
 * Job openings, paged.
 *
 * PAGED, AND THAT IS A REVERSAL. The previous version returned the whole set with a
 * comment justifying it ("a recruiter needs the counts for all of them at once").
 * The justification does not survive contact with the fact that the counts are PER
 * ROW — `candidate_count`, `hired_count` and `vacancies_remaining` already travel
 * with each opening, so a recruiter reading page 1 sees every opening's vacancy
 * status that page contains and nothing is lost by paging. Meanwhile the unpaged
 * version had no `page`/`totalPages`, which meant the frontend could not render the
 * pager it has on the candidates and offers screens, and this module ended up with
 * two different list-response shapes behind one route prefix.
 *
 * The `total` count reuses the SAME WHERE clause as the page query rather than
 * counting a second, looser filter. Two near-identical WHERE clauses drifting apart is
 * how a paginator ends up advertising 4 pages for a list whose page 3 is empty.
 *
 * `o.` qualification is load-bearing: the query joins departments and designations,
 * and BOTH carry their own `organization_id`, so an unqualified `organization_id` in
 * the WHERE is ambiguous across the join and MySQL refuses it.
 */
export async function listOpenings({
  orgId,
  status,
  page = 1,
  limit = 20,
  offset = 0,
  conn = pool,
}) {
  const clauses = ["o.organization_id = ?"];
  const params = [orgId];
  if (status) {
    if (!JOB_STATUSES.includes(status)) {
      throw new ApiError(400, `status must be one of: ${JOB_STATUSES.join(", ")}`);
    }
    clauses.push("o.status = ?");
    params.push(status);
  }
  const where = clauses.join(" AND ");

  // `offset` is DERIVED from page/limit when the caller does not supply one.
  // listCandidates and listOffers take all three separately, and that is a footgun
  // this function just proved in its own test: a caller passing `page` without
  // `offset` silently receives page 1 on every request, which looks like working
  // pagination for exactly as long as the first page is big enough. The two older
  // services keep their signature because their callers already pass `offset`; here
  // the page is the only thing a caller should have to think about.
  const effectiveOffset = offset || (page - 1) * limit;

  const [[{ total }]] = await conn.query(
    `SELECT COUNT(*) AS total FROM job_openings o WHERE ${where}`,
    params
  );

  const [rows] = await conn.query(
    `SELECT o.*,
            dp.name AS department_name,
            dg.name AS designation_name,
            (SELECT COUNT(*) FROM candidates c
              WHERE c.organization_id = o.organization_id AND c.job_opening_uuid = o.uuid) AS candidate_count,
            (SELECT COUNT(*) FROM candidates c
              WHERE c.organization_id = o.organization_id AND c.job_opening_uuid = o.uuid
                AND c.stage = 'hired') AS hired_count
       FROM job_openings o
       LEFT JOIN departments dp ON dp.id = o.department_id
       LEFT JOIN designations dg ON dg.id = o.designation_id
      WHERE ${where}
      ORDER BY o.status = 'open' DESC, o.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, effectiveOffset]
  );

  return {
    items: rows.map((r) => ({
      ...r,
      candidate_count: Number(r.candidate_count ?? 0),
      hired_count: Number(r.hired_count ?? 0),
      vacancies_remaining: Math.max(0, Number(r.vacancies ?? 1) - Number(r.hired_count ?? 0)),
    })),
    total: Number(total),
    page,
    limit,
  };
}

/**
 * Update an opening.
 *
 * `status` is one of the mutable fields but `vacancies` is deliberately NOT
 * reduced below the number already hired: lowering it to 1 when three people have
 * been hired would report a vacancy that is already over-filled and quietly block
 * the next hire. Over-hiring is a money question, so it is refused rather than
 * made visible.
 */
export async function updateOpening({
  orgId,
  openingUuid,
  actorUuid,
  title,
  departmentId,
  designationId,
  location,
  employmentType,
  description,
  status,
  vacancies,
  conn = pool,
}) {
  const opening = await loadOpening({ orgId, openingUuid, conn });

  if (title !== undefined && !String(title).trim()) {
    throw new ApiError(400, "title cannot be empty");
  }
  if (status !== undefined && !JOB_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${JOB_STATUSES.join(", ")}`);
  }
  if (employmentType !== undefined && !EMPLOYMENT_TYPES.includes(employmentType)) {
    throw new ApiError(400, `employment_type must be one of: ${EMPLOYMENT_TYPES.join(", ")}`);
  }

  const sets = [];
  const params = [];
  const add = (col, value) => {
    sets.push(`\`${col}\` = ?`);
    params.push(value);
  };

  if (title !== undefined) add("title", String(title).trim());
  if (location !== undefined) add("location", location ? String(location).trim() : null);
  if (employmentType !== undefined) add("employment_type", employmentType);
  if (description !== undefined) add("description", description ? String(description).trim() : null);
  if (status !== undefined) add("status", status);

  if (departmentId !== undefined) {
    add(
      "department_id",
      await assertOrgOwnedId({
        orgId,
        table: "departments",
        id: departmentId,
        label: "Department",
        conn,
      })
    );
  }
  if (designationId !== undefined) {
    add(
      "designation_id",
      await assertOrgOwnedId({
        orgId,
        table: "designations",
        id: designationId,
        label: "Designation",
        conn,
      })
    );
  }

  if (vacancies !== undefined) {
    const seats = Number(vacancies);
    if (!Number.isInteger(seats) || seats < 1) {
      throw new ApiError(400, "vacancies must be a positive whole number");
    }
    const [[agg]] = await conn.query(
      "SELECT COUNT(*) AS hired FROM candidates WHERE organization_id=? AND job_opening_uuid=? AND stage='hired'",
      [orgId, openingUuid]
    );
    const alreadyHired = Number(agg?.hired ?? 0);
    if (seats < alreadyHired) {
      throw new ApiError(
        409,
        `This opening already has ${alreadyHired} hire(s); vacancies cannot be set below that. Close it instead`,
      );
    }
    add("vacancies", seats);
  }

  if (sets.length) {
    sets.push("updated_at = NOW()");
    params.push(openingUuid, orgId);
    await conn.query(
      `UPDATE job_openings SET ${sets.join(", ")} WHERE uuid=? AND organization_id=?`,
      params
    );
    logAudit({
      actorType: "user",
      actorId: actorUuid ?? null,
      action: "job_opening.update",
      entityType: "job_opening",
      entityId: openingUuid,
      details: { status, vacancies },
    });
  }

  return getOpening({ orgId, openingUuid, conn });
}

// ===========================================================================
// Candidates
// ===========================================================================

/**
 * Load a candidate scoped to the organization.
 *
 * The enforcement point for candidate tenancy. `interviews` carries a composite
 * tenant foreign key onto candidates so a row cannot point across orgs, but a
 * caller naming another org's CANDIDATE uuid is this function's problem.
 */
export async function loadCandidate({ orgId, candidateUuid, conn = pool, forUpdate = false }) {
  assertUuid(candidateUuid, "Candidate UUID");
  const [rows] = await conn.query(
    `SELECT * FROM candidates WHERE uuid=? AND organization_id=?${forUpdate ? " FOR UPDATE" : ""}`,
    [candidateUuid, orgId]
  );
  if (!rows.length) throw new ApiError(404, "Candidate not found in this organization");
  return rows[0];
}

/**
 * File an application.
 *
 * Requires an OPEN opening. A draft opening is one being written, not one being
 * advertised, and a closed one is retained only so the record of who applied
 * survives. Accepting applications against either means the careers form is a
 * back door into a vacancy nobody agreed to advertise.
 */
export async function createCandidate({
  orgId,
  actorUuid,
  openingUuid,
  fullName,
  email,
  phone,
  cnic,
  coverLetter,
  notes,
  conn = pool,
}) {
  if (!fullName || !String(fullName).trim()) throw new ApiError(400, "full_name is required");

  let address = email ? String(email).trim().toLowerCase() : null;
  // Lowercased before the duplicate check so "Ali@x.com" and "ali@x.com" are the
  // same person. The unique index is on the stored value, so an un-normalised write
  // would let the second one straight past it.
  if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new ApiError(400, "email is not a valid address");
  }

  const opening = await loadOpening({ orgId, openingUuid, conn, requireStatus: "open" });

  const uuid = randomUUID();
  try {
    await conn.query(
      `INSERT INTO candidates
         (uuid, organization_id, job_opening_uuid, full_name, email, phone, cnic,
          cover_letter, notes, stage, created_by_uuid, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?, NOW(), NOW())`,
      [
        uuid,
        orgId,
        opening.uuid,
        String(fullName).trim(),
        address,
        phone ? String(phone).trim() : null,
        cnic ? String(cnic).trim() : null,
        coverLetter ? String(coverLetter).trim() : null,
        notes ? String(notes).trim() : null,
        actorUuid ?? null,
      ]
    );
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      // Only (job_opening_uuid, email) is unique here, so this is the same person
      // applying twice for the same role. They may legitimately apply for a
      // DIFFERENT opening, which is why the constraint is scoped to the opening.
      throw new ApiError(
        409,
        "This person has already applied for this position",
      );
    }
    throw e;
  }

  logAudit({
    actorType: "user",
    actorId: actorUuid ?? null,
    action: "candidate.create",
    entityType: ATTACHMENT_ENTITY.CANDIDATE,
    entityId: uuid,
    details: { opening_uuid: opening.uuid, email: address },
  });

  return getCandidate({ orgId, candidateUuid: uuid, conn });
}

/**
 * One candidate with their opening, interviews and resume.
 *
 * Interviews come back in one query rather than lazily, because the detail panel
 * always shows them and a second round trip per open is a visible wait.
 */
export async function getCandidate({ orgId, candidateUuid, conn = pool }) {
  const candidate = await loadCandidate({ orgId, candidateUuid, conn });

  const [openings] = await conn.query(
    "SELECT uuid, title, location, employment_type, vacancies, status FROM job_openings WHERE uuid=? AND organization_id=?",
    [candidate.job_opening_uuid, orgId]
  );
  const [interviews] = await conn.query(
    `SELECT uuid, interviewer_uuid, scheduled_at, mode, location, feedback_notes,
            \`rating\`, status, outcome, created_at
       FROM interviews
      WHERE organization_id=? AND candidate_uuid=?
      ORDER BY scheduled_at ASC`,
    [orgId, candidateUuid]
  );
  const resumes = await listResumes({ orgId, candidateUuid, conn });

  return {
    ...candidate,
    opening: openings[0] ?? null,
    interviews,
    resumes,
    resume_count: resumes.length,
    // DECIMAL arrives as a string over the wire. Normalised to a number so a client
    // can render it without parsing, and so `rating === null` means "not rated"
    // rather than "the string 'null'".
    //
    // Plain key, not backticks: the backtick form is SQL quoting. `rating` is a
    // reserved word in MySQL 8 (which is why every query here quotes it) but not in
    // JavaScript, where a bare computed key would simply be a syntax error.
    rating: candidate.rating === null ? null : money(candidate.rating),
  };
}

export async function listCandidates({
  orgId,
  openingUuid,
  stage,
  search,
  page = 1,
  limit = 20,
  offset = 0,
  conn = pool,
}) {
  const clauses = ["c.organization_id = ?"];
  const params = [orgId];

  if (openingUuid) {
    assertUuid(openingUuid, "Job opening UUID");
    clauses.push("c.job_opening_uuid = ?");
    params.push(openingUuid);
  }
  if (stage) {
    if (!CANDIDATE_STAGES.includes(stage)) {
      throw new ApiError(400, `stage must be one of: ${CANDIDATE_STAGES.join(", ")}`);
    }
    clauses.push("c.stage = ?");
    params.push(stage);
  }
  if (search && String(search).trim()) {
    // LIKE with an escaped wildcard, so a search for "100%" is a literal and a
    // search for "_" does not match every single character.
    const needle = `%${String(search).trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;
    clauses.push("(c.full_name LIKE ? OR c.email LIKE ?)");
    params.push(needle, needle);
  }

  const where = clauses.join(" AND ");
  const [[{ total }]] = await conn.query(
    `SELECT COUNT(*) AS total FROM candidates c WHERE ${where}`,
    params
  );
  const [rows] = await conn.query(
    `SELECT c.*, o.title AS opening_title,
            (SELECT COUNT(*) FROM interviews i
              WHERE i.organization_id = c.organization_id
                AND i.candidate_uuid = c.uuid AND i.status = 'completed') AS completed_interviews
       FROM candidates c
       LEFT JOIN job_openings o ON o.uuid = c.job_opening_uuid AND o.organization_id = c.organization_id
      WHERE ${where}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map((r) => ({
      ...r,
      rating: r.rating === null ? null : money(r.rating),
      completed_interviews: Number(r.completed_interviews ?? 0),
    })),
    total: Number(total),
    page,
    limit,
  };
}

/**
 * Move a candidate to another stage.
 *
 * ONLY ALLOWED MOVES ARE ACCEPTED, from a table rather than by trusting the
 * caller's intent. A pipeline is a set of allowed transitions, and letting a
 * client name any stage would make "applied -> hired" a single API call that skips
 * the entire process — which is exactly the shortcut this module exists to make
 * impossible.
 *
 *   applied  -> screening, rejected
 *   screening-> interview, rejected
 *   interview-> offered, rejected
 *   offered  -> hired (only via hireCandidate), rejected
 *   hired    -> (terminal)
 *   rejected -> (terminal)
 */
const ALLOWED_TRANSITIONS = {
  applied: ["screening", "rejected"],
  screening: ["interview", "selected", "rejected"],
  interview: ["selected", "rejected"],
  selected: ["offered", "rejected"],
  // `hired` is deliberately absent. It is reachable ONLY through hireCandidate(),
  // because arriving at `hired` requires creating an employee row and an offer
  // letter, and a bare stage update would create neither.
  offered: ["rejected"],
  hired: [],
  declined: [],
  rejected: [],
};

export async function updateCandidateStage({
  orgId,
  actorUuid,
  candidateUuid,
  stage,
  rejectionReason,
  rating,
  notes,
  conn = pool,
}) {
  if (!CANDIDATE_STAGES.includes(stage)) {
    throw new ApiError(400, `stage must be one of: ${CANDIDATE_STAGES.join(", ")}`);
  }

  const candidate = await loadCandidate({ orgId, candidateUuid, conn });

  if (stage === "hired") {
    throw new ApiError(
      400,
      "A candidate is hired through the hire action, which also creates their employee record and offer letter",
    );
  }
  if (candidate.stage === stage) {
    // Not an error: a Kanban card dragged onto its own column is a no-op, and
    // throwing there would make the board feel broken.
    return getCandidate({ orgId, candidateUuid, conn });
  }

  const allowed = ALLOWED_TRANSITIONS[candidate.stage] ?? [];
  if (!allowed.includes(stage)) {
    if (!allowed.length) {
      throw new ApiError(409, `A candidate who is already ${candidate.stage} cannot be moved`);
    }
    throw new ApiError(
      409,
      `A candidate at "${candidate.stage}" can only move to: ${allowed.join(", ")}`,
    );
  }

  if (stage === "rejected" && !rejectionReason) {
    throw new ApiError(400, "A rejection needs a reason");
  }

  // The column is `rejected_reason`, not `rejection_reason`. The two differ from
  // expense_claims.rejection_reason, which is a real inconsistency between two
  // modules written a week apart — not a typo. Renaming an already-applied,
  // checksummed column to fix it would cost a permanent migration for a naming
  // preference on a table with no production data, which is the worse trade.
  const sets = ["stage = ?", "rejected_reason = ?", "updated_at = NOW()"];
  const params = [
    stage,
    stage === "rejected" ? String(rejectionReason).trim() : null,
  ];

  if (rating !== undefined) {
    sets.push("`rating` = ?");
    params.push(ratingOrNull(rating));
  }
  if (notes !== undefined) {
    sets.push("notes = ?");
    params.push(notes ? String(notes).trim() : null);
  }

  params.push(candidateUuid, orgId);
  // The stage guard in the WHERE is what makes this safe under concurrency: two
  // recruiters moving one candidate at the same moment both read `screening` above,
  // and the loser's UPDATE matches zero rows rather than skipping a stage.
  await conn.query(
    `UPDATE candidates SET ${sets.join(", ")} WHERE uuid=? AND organization_id=? AND stage=?`,
    [...params, candidate.stage]
  );

  logAudit({
    actorType: "user",
    actorId: actorUuid ?? null,
    action: `candidate.stage.${stage}`,
    entityType: ATTACHMENT_ENTITY.CANDIDATE,
    entityId: candidateUuid,
    details: { from: candidate.stage, to: stage },
  });

  return getCandidate({ orgId, candidateUuid, conn });
}

// ===========================================================================
// The one-click hire
// ===========================================================================

/**
 * Convert an OFFERED candidate into a real employee, with an offer letter.
 *
 * ONE TRANSACTION, THREE WRITES: the employee row, the offer-letter draft, and the
 * candidate's flip to `hired` with a back-reference to both. The reason is not
 * tidiness:
 *
 *   - If the employee were written on one connection and the letter on another,
 *     a failure between them leaves a hired person with no offer letter — the exact
 *     artefact HR needs to prove what they were hired on.
 *   - If the candidate flipped to `hired` but the employee INSERT then failed, the
 *     pipeline shows a hire that produced no employee, and `converted_employee_uuid`
 *     is null so re-running does nothing useful.
 *
 * So all three commit together or none of them do.
 *
 * `cnic` is passed through as given and may be null: a national ID frequently does
 * not exist at hiring time, and employees.cnic was relaxed to nullable for exactly
 * this reason (see 20261115). No placeholder is invented, because "not collected
 * yet" and "collected and blank" must stay distinguishable.
 */
export async function hireCandidate({
  orgId,
  actorUuid,
  candidateUuid,
  cnic,
  joiningDate,
  designationId,
  departmentId,
  emergencyContact,
  offerAcceptance = false,
  responseNotes = null,
  offerLetterTemplateUuid,
  offerLetterTitle,
  offerValues = {},
  now = null,
  conn = pool,
}) {
  assertUuid(candidateUuid, "Candidate UUID");

  /**
   * OWNS ITS TRANSACTION unless the caller supplies one already in progress.
   *
   * THIS WAS MISSING, AND IT MEANT THE THREE WRITES BELOW WERE NOT ATOMIC.
   *
   * The function documents that the employee row, the offer letter and the stage
   * flip commit together or not at all — but it only ever ACCEPTED a connection. Given
   * the pool, or any connection not already in a transaction, the employee INSERT ran
   * in autocommit and was committed the instant it executed. A failure drafting the
   * letter one statement later then left a real person on the roster with no offer and
   * a candidate still at `offered`: the one corrupt outcome this function exists to
   * make impossible. It is the same class of defect as the expenses rollback, where
   * marking claims paid on the pool rather than the transaction would strand them.
   *
   * `own = conn === pool` is the established idiom in this codebase (see
   * offboarding.service.js createExitRequest) rather than an optional flag, because
   * it cannot be forgotten at a call site: a caller that has no transaction to join
   * gets one, and a caller that does is left alone.
   *
   * THE CONTRACT THIS IMPLIES, stated because it is the one that bites: a `conn`
   * passed in MUST already be inside beginTransaction(). Handing this function a bare
   * connection — a pool connection, or a test's plain `db` — sets own=false, so no
   * transaction is opened and the employee INSERT commits in autocommit, exactly as
   * before. Nothing warns you; the partial write is simply still possible. The
   * controller passes no connection and is therefore safe, and tests that pass `conn`
   * for speed are the realistic way to hit this.
   */
  const own = conn === pool;
  const db = own ? await pool.getConnection() : conn;
  if (own) await db.beginTransaction();

  try {
    const result = await hireCandidateInTransaction({
      db,
      orgId,
      actorUuid,
      candidateUuid,
      cnic,
      joiningDate,
      designationId,
      departmentId,
      emergencyContact,
      offerAcceptance,
      responseNotes,
      offerLetterTemplateUuid,
      offerLetterTitle,
      offerValues,
      now,
    });
    if (own) await db.commit();
    return result;
  } catch (e) {
    // Unconditional when we own it. A partial rollback would leave the caller
    // believing nothing was written while an employee row sat on the roster.
    if (own) await db.rollback();
    throw e;
  } finally {
    if (own) db.release();
  }
}

/**
 * The body of hireCandidate, always executed on a connection in a transaction.
 *
 * Split out so the transaction wrapper above reads as a wrapper rather than being
 * interleaved with the rules, and so this half can be reached with a caller's
 * transaction. No `own` check belongs in here: by construction there is always one.
 */
async function hireCandidateInTransaction({
  db,
  orgId,
  actorUuid,
  candidateUuid,
  cnic,
  joiningDate,
  designationId,
  departmentId,
  emergencyContact,
  offerAcceptance,
  responseNotes,
  offerLetterTemplateUuid,
  offerLetterTitle,
  offerValues,
  now,
}) {

  const candidate = await loadCandidate({ orgId, candidateUuid, conn: db, forUpdate: true });

  if (!offerAcceptance || candidate.offer_status !== "sent") {
    throw new ApiError(409, "An employee can be created only after the candidate accepts a sent offer");
  }
  if (!["selected", "offered"].includes(candidate.stage)) {
    // Includes already-hired, so a second click on the Hire button says why rather
    // than creating a second employee.
    throw new ApiError(
      409,
      candidate.stage === "hired"
        ? "This candidate has already been hired"
        : `Only a candidate at "offered" can be hired (this one is at "${candidate.stage}")`,
    );
  }
  if (candidate.converted_employee_uuid) {
    throw new ApiError(409, "This candidate already has an employee record");
  }

  // The opening's vacancies are checked INSIDE the transaction, and the count is
  // taken with the row locked above, so two recruiters hiring for a one-seat
  // opening cannot both pass the check.
  const [openings] = await db.query(
    "SELECT vacancies, designation_id, department_id, employment_type FROM job_openings WHERE uuid=? AND organization_id=?",
    [candidate.job_opening_uuid, orgId]
  );
  const opening = openings[0];
  if (!opening) throw new ApiError(404, "The job opening for this candidate no longer exists");

  const [[agg]] = await db.query(
    "SELECT COUNT(*) AS hired FROM candidates WHERE organization_id=? AND job_opening_uuid=? AND stage='hired'",
    [orgId, candidate.job_opening_uuid]
  );
  const alreadyHired = Number(agg?.hired ?? 0);
  if (alreadyHired >= Number(opening.vacancies ?? 1)) {
    throw new ApiError(
      409,
      `This opening has ${opening.vacancies} vacancy/vacancies and ${alreadyHired} already filled`,
    );
  }

  // The designation the candidate was OFFERED comes from the opening, not from the
  // recruiter's memory: the offer is the record of what was agreed.
  const employeeDesignation = designationId ?? opening.designation_id ?? null;
  const employeeDepartment = departmentId ?? opening.department_id ?? null;

  // The sent/approved offer snapshot is the offer letter. Hiring must not create a
  // second draft HR letter after acceptance; it converts the accepted offer once.
  const approvedOfferValues = parseOfferValues(candidate.offer_values);
  const effectiveCnic = cnic ?? candidate.cnic ?? approvedOfferValues.cnic ?? null;
  const effectiveJoiningDate = joiningDate ?? approvedOfferValues.joining_date ?? null;
  const startingSalaryRaw = approvedOfferValues.new_salary;
  const startingSalary = startingSalaryRaw == null || String(startingSalaryRaw).trim() === "" ? null : Number(String(startingSalaryRaw).replace(/,/g, ""));
  if (startingSalaryRaw != null && String(startingSalaryRaw).trim() !== "" && (!Number.isFinite(startingSalary) || startingSalary <= 0)) {
    throw new ApiError(409, "The approved offer salary is not a valid positive amount. Revise the offer and obtain approval again before acceptance.");
  }

  /*
   * A candidate email is COLLECTED, NOT REQUIRED. It used to be forced here because
   * the hire issued the invitation in the same transaction, so an employee without
   * one would be unable to ever log in. That coupling is gone — the invitation is
   * now triggered from the employee row, and the endpoint that issues it does its
   * own email check at that point. A candidate hired from a walk-in with no email
   * on file is therefore a normal, complete hire rather than a refused one.
   */
  const employeeUuid = randomUUID();
  const [employeeInsert] = await db.query(
    `INSERT INTO employees
       (uuid, organization_id, full_name, email, phone, cnic, designation_id,
        department_id, employment_type, joining_date, emergency_contact, status, added_by_uuid, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'current_employee', ?, NOW())`,
    [
      employeeUuid,
      orgId,
      candidate.full_name,
      candidate.email,
      candidate.phone,
      effectiveCnic ? String(effectiveCnic).trim() : null,
      employeeDesignation,
      employeeDepartment,
      opening.employment_type === "internship" ? "intern" : opening.employment_type,
      effectiveJoiningDate ? isoDate(effectiveJoiningDate) : isoDate(now ?? new Date()),
      emergencyContact ? String(emergencyContact).trim() : null,
      actorUuid ?? null,
    ]
  );
  const employeeCode = `EMP-${String(employeeInsert.insertId).padStart(6, "0")}`;
  await db.query("UPDATE employees SET employee_code=? WHERE id=? AND organization_id=?", [employeeCode, employeeInsert.insertId, orgId]);

  if (startingSalary !== null) {
    const salaryDate = effectiveJoiningDate ? isoDate(effectiveJoiningDate) : isoDate(now ?? new Date());
    await db.query(
      `INSERT INTO employee_salary_history (uuid,employee_uuid,year,basic_salary,effective_from,effective_to,created_at)
       VALUES (UUID(),?,?,?,?,NULL,NOW())`,
      [employeeUuid, Number(salaryDate.slice(0, 4)), startingSalary, salaryDate],
    );
  }

  /*
   * NO PORTAL INVITE HERE, and that is deliberate — an accepted offer creates the
   * employee record, nothing more. Inviting someone is its own act with its own
   * recipient: the recruiter who accepted the offer on Monday is not necessarily
   * the person who wants to decide on Tuesday whether this new hire gets a login
   * today, after their documents arrive. Doing it inline also meant a mail hiccup
   * after a committed hire reported as "offer accepted" while the invitation had
   * silently never gone out, and the only place to notice was the employee list.
   *
   * The invite goes out from there instead, via POST /org/employees/:uuid/resend-invite,
   * which mints a fresh token and delivers after its own commit. Same generation,
   * same protections, chosen moment.
   */
  // The UPDATE re-asserts both preconditions. This is the one-shot guard: of two
  // concurrent hires, one matches this row and the other matches nothing.
  const [result] = await db.query(
    `UPDATE candidates
        SET stage='hired', converted_employee_uuid=?, offer_status='accepted',
            offer_response_at=NOW(), offer_response_notes=?, hired_at=COALESCE(?, NOW()),
            converted_at=NOW(), updated_at=NOW()
      WHERE uuid=? AND organization_id=? AND stage IN ('selected','offered') AND offer_status='sent' AND converted_employee_uuid IS NULL`,
    [employeeUuid, responseNotes?.trim() || null, now, candidateUuid, orgId]
  );

  if (!result.affectedRows) {
    // Another hire won the race while this transaction was running. Throwing here
    // rolls back the employee INSERT and the letter, which is what makes the race
    // safe rather than merely unlikely.
    throw new ApiError(
      409,
      "This candidate was hired by someone else a moment ago; nothing was saved",
    );
  }

  logAudit({
    actorType: "user",
    actorId: actorUuid ?? null,
    action: "candidate.hire",
    entityType: ATTACHMENT_ENTITY.CANDIDATE,
    entityId: candidateUuid,
    details: {
      employee_uuid: employeeUuid,
      opening_uuid: candidate.job_opening_uuid,
      portal_invite_sent: false,
    },
  });

  return {
    candidate: await getCandidate({ orgId, candidateUuid, conn: db }),
    employee_uuid: employeeUuid,
    offer_letter: null,
    employeeEmail: candidate.email,
  };
}

// ===========================================================================
// Offers
// ===========================================================================

/**
 * An "offer" is a CANDIDATE AT `offered` PLUS THE DRAFT LETTER THEIR HIRE CREATED.
 *
 * There is deliberately no `offers` table, and that is a decision worth stating
 * rather than a gap. An offer in this product is not an independent record with its
 * own lifecycle: it is a stage a candidate occupies, and the letter that embodies it
 * is an `hr_letters` row created in the hire transaction. A separate table would mean
 * a third representation of the same fact — candidate.stage, the letter, and the
 * offer row — able to disagree with each other, and the one that matters most
 * (whether money was promised) is exactly the one that must not drift.
 *
 * So this list is a VIEW over candidates joined to their letter. It is read-only by
 * construction: an offer cannot be edited here, only issued or revoked, and both of
 * those act on the letter through hrLetters.service.js.
 */
export async function listOffers({
  orgId,
  openingUuid,
  page = 1,
  limit = 20,
  offset = 0,
  conn = pool,
}) {
  // ONLY `hired`. Not `offered` too, as an earlier version had it: an offer letter is
  // created by hireCandidate, so a candidate still at `offered` has no letter and
  // every action on that row would 409. Listing them here produced offers the user
  // could not approve, send, or even inspect — a row whose only possible outcome was
  // an error. Approval and sending are POST-hire, so `hired` is the whole population.
  const clauses = ["c.organization_id = ?", "(c.offer_status IS NOT NULL OR c.stage = 'hired')"];
  const params = [orgId];

  if (openingUuid) {
    assertUuid(openingUuid, "Job opening UUID");
    clauses.push("c.job_opening_uuid = ?");
    params.push(openingUuid);
  }

  const where = clauses.join(" AND ");
  const [[{ total }]] = await conn.query(
    `SELECT COUNT(*) AS total FROM candidates c WHERE ${where}`,
    params
  );
  const [rows] = await conn.query(
    `SELECT c.uuid AS candidate_uuid, c.full_name, c.email, c.stage, c.hired_at, c.offer_status, c.offer_sent_at, c.offer_response_at, c.offer_response_notes,
            c.offer_letter_uuid, c.converted_employee_uuid, c.offer_template_uuid, c.offer_values,
            c.offer_body_snapshot, c.offer_snapshot_hash,
            o.title AS opening_title,
            l.reference_no, l.status AS letter_status, l.title AS letter_title,
            l.issued_at, l.qr_token
       FROM candidates c
       LEFT JOIN job_openings o
         ON o.uuid = c.job_opening_uuid AND o.organization_id = c.organization_id
       LEFT JOIN hr_letters l
         ON l.uuid = c.offer_letter_uuid AND l.organization_id = c.organization_id
      WHERE ${where}
      ORDER BY c.updated_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map((r) => ({
      ...r,
      // Mirrors hrLetters.getLetter: a verify URL is only meaningful once issued,
      // because the QR token is minted at issue time.
      verify_url: r.qr_token && r.letter_status === "issued" ? `/verify/${r.qr_token}` : null,
      /**
       * Whether this offer can be sent.
       *
       * False for a candidate who was hired without a letter, and for one already
       * issued. The UI uses it to disable the button rather than to decide server
       * behaviour — issueLetter refuses anything that is not a draft anyway.
       */
      can_send: r.letter_status === "draft",
    })),
    total: Number(total),
    page,
    limit,
  };
}

/**
 * Issue a candidate's offer letter.
 *
 * A THIN WRAPPER, and deliberately so. Every rule about what a letter may say —
 * unresolved merge tags, QR signing being configured, re-issuing an already issued
 * letter — already lives in hrLetters.service.js and is enforced there in a
 * transaction. Re-implementing any of it here would create a second place to get it
 * wrong, and the failure mode would be printing "Dear , your salary is $" onto a
 * document a candidate has already signed.
 *
 * The candidate is re-read first so the letter uuid comes from THIS org's row rather
 * than from the request body. Pointing this at another tenant's letter would issue
 * their document.
 */
/**
 * Send a candidate's offer letter.
 *
 * A THIN WRAPPER over hrLetters, deliberately. Every rule about what a letter may
 * say -- unresolved merge tags, QR signing being configured, re-issuing an already
 * issued letter -- already lives in hrLetters.service.js and is enforced there in a
 * transaction. Re-implementing any of it here would create a second place to get it
 * wrong, and the failure would be printing "Dear , your salary is $" onto a document
 * a candidate has already signed.
 *
 * REQUIRES AN APPROVED OFFER APPROVAL, checked here rather than in the controller
 * because this is the irreversible step: issuing mints a QR token and freezes the
 * merged body. A candidate can sit at `offered` indefinitely; they cannot obtain a
 * signed offer without an approver having decided it.
 *
 * The candidate is re-read first so the letter uuid comes from THIS org's row rather
 * than from the request body. Pointing this at another tenant's letter would issue
 * their document.
 *
 * NOTE `conn`, not `db`: an earlier sweep of this file renamed the connection
 * parameter to `db` inside this function too, so it no longer honoured a caller's
 * connection at all. That is the same class of mistake as the shorthand `db:` in
 * createDraftLetter -- a renamed parameter that still parses, silently dropping an
 * argument.
 */
export async function sendOffer({ orgId, actorUuid, candidateUuid, conn = pool }) {
  const db = conn === pool ? await pool.getConnection() : conn;
  const own = conn === pool;
  try {
    if (own) await db.beginTransaction();
    const candidate = await loadCandidate({ orgId, candidateUuid, conn: db, forUpdate: true });
    if (!["selected", "offered"].includes(candidate.stage)) throw new ApiError(409, "Only a selected candidate can receive an offer");
    if (!candidate.email) throw new ApiError(409, "Add the candidate?s email address before sending the offer");
    const approval = await getOfferApproval({ orgId, candidateUuid, conn: db });
    if (!approval || approval.status !== "approved") throw new ApiError(409, "Offer must be approved before it can be sent");
    const approved = approval.payload ?? {};
    const storedValues = parseOfferValues(candidate.offer_values);
    const currentHash = createHash("sha256").update(stableJson({ template_uuid: candidate.offer_template_uuid, values: storedValues, body: candidate.offer_body_snapshot })).digest("hex");
    if (!candidate.offer_template_uuid || !candidate.offer_body_snapshot || currentHash !== candidate.offer_snapshot_hash ||
        approved.snapshot_hash !== candidate.offer_snapshot_hash || approved.rendered_body !== candidate.offer_body_snapshot ||
        approved.offer_template_uuid !== candidate.offer_template_uuid) {
      throw new ApiError(409, "Approved offer content has changed. Review it and submit for approval again.");
    }
    const currentTemplate = await getTemplate({ orgId, templateUuid: candidate.offer_template_uuid });
    const currentTemplateHash = createHash("sha256").update(currentTemplate.body).digest("hex");
    if (currentTemplate.letter_type !== "offer" || currentTemplateHash !== candidate.offer_template_hash) {
      throw new ApiError(409, "The approved Offer Letter template changed. Review the offer and submit it for approval again.");
    }
    try {
      await sendRecruitmentOfferEmail({
        to: candidate.email,
        candidateName: candidate.full_name,
        openingTitle: approved.opening_title ?? "",
        renderedBody: candidate.offer_body_snapshot,
      });
    } catch (error) {
      logAudit({ actorType: "user", actorId: actorUuid ?? null, action: "candidate.offer.send.failed",
        entityType: ATTACHMENT_ENTITY.CANDIDATE, entityId: candidate.uuid,
        details: { error: String(error?.message ?? "delivery failed").slice(0, 240) } });
      throw new ApiError(502, "The offer email could not be sent. Check the mail configuration and retry; the offer remains approved.");
    }
    const [updated] = await db.query(
      "UPDATE candidates SET offer_status='sent', offer_sent_at=NOW(), updated_at=NOW() WHERE uuid=? AND organization_id=? AND stage IN ('selected','offered') AND offer_status='approved'",
      [candidate.uuid, orgId]
    );
    if (!updated.affectedRows) throw new ApiError(409, "Offer state changed; refresh and try again");
    if (own) await db.commit();
    logAudit({ actorType: "user", actorId: actorUuid ?? null, action: "candidate.offer.send",
      entityType: ATTACHMENT_ENTITY.CANDIDATE, entityId: candidate.uuid,
      details: { approval_request_uuid: approval.uuid, snapshot_hash: candidate.offer_snapshot_hash } });
    return { candidate_uuid: candidate.uuid, status: "sent", sent_at: new Date().toISOString() };
  } catch (error) {
    if (own) await db.rollback();
    throw error;
  } finally {
    if (own) db.release();
  }
}

/**
 * Record the candidate's answer to a sent offer.
 *
 * ACCEPTING CREATES THE EMPLOYEE, AND ONLY THE EMPLOYEE. There is no portal
 * invitation in this flow, and removing it is the point: "this person starts
 * Monday" and "this person can log into our HR system" are two decisions, and
 * the recruiter standing at the pipeline board is making the first one. Inviting
 * someone is a deliberate act on the employee row afterwards — POST
 * /org/employees/:uuid/resend-invite — where the mailbox, the timing and the
 * reason are chosen rather than inherited from an offer flow that has already
 * finished its job.
 *
 * `portal_access` IS NOT PARAMETERISED ANY MORE. It is dropped here rather than
 * forwarded and ignored, because a parameter that is accepted and does nothing
 * is a lie in the signature — a reader would conclude the field still does
 * something. The controller handles the field it still receives on the body.
 */
export async function respondToOffer({
  orgId, actorUuid, candidateUuid, response, joiningDate, cnic,
  designationId, departmentId, emergencyContact, comments, conn = pool,
}) {
  const candidate = await loadCandidate({ orgId, candidateUuid, conn, forUpdate: true });
  if (!["selected", "offered"].includes(candidate.stage) || candidate.offer_status !== "sent") {
    throw new ApiError(409, "Only a sent offer can receive a response");
  }
  if (response === "declined") {
    const [updated] = await conn.query(
      "UPDATE candidates SET stage='declined', offer_status='declined', offer_response_at=NOW(), offer_response_notes=?, updated_at=NOW() WHERE uuid=? AND organization_id=? AND stage IN ('selected','offered') AND offer_status='sent'",
      [comments?.trim() || null, candidate.uuid, orgId]
    );
    if (!updated.affectedRows) throw new ApiError(409, "Offer state changed; refresh and try again");
    logAudit({ actorType: "user", actorId: actorUuid ?? null, action: "candidate.offer.declined",
      entityType: ATTACHMENT_ENTITY.CANDIDATE, entityId: candidate.uuid, details: { comments: comments ?? null } });
    return { candidate: await getCandidate({ orgId, candidateUuid, conn }), employee_uuid: null };
  }
  if (response !== "accepted") throw new ApiError(400, "response must be accepted or declined");
  return hireCandidate({
    orgId, actorUuid, candidateUuid, cnic, joiningDate, designationId, departmentId,
    emergencyContact, offerAcceptance: true, responseNotes: comments, conn,
  });
}

// ---------------------------------------------------------------------------
// Offer approval -- the only approve/reject path for offers
//
// Offers route through the SHARED approval workflow engine rather than carrying
// their own approve/reject columns, because that engine already encodes the rules
// that are easy to get wrong once and expensive to learn twice:
//
//   - one in-flight approval per entity, via a generated `live_entity_uuid` column
//     AND a unique index, so a double submit cannot open two chains
//   - rejection is terminal, and a resubmission is allowed afterwards
//   - the step history is append-only, which is exactly what ApprovalTimeline renders
//
// The alternative -- an `offer_status` column on candidates with an approve button --
// would be a second approval mechanism living beside the engine, with its own idea of
// who may approve what and no shared audit trail. That is the parallel implementation
// this avoids.
// ---------------------------------------------------------------------------

const OFFER_INPUT_TAGS = new Set(["designation", "department", "joining_date", "cnic", "new_salary"]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseOfferValues(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed : {}; }
  catch { return {}; }
}

async function offerContext({ orgId, candidateUuid, conn = pool }) {
  const candidate = await loadCandidate({ orgId, candidateUuid, conn });
  const [[context]] = await conn.query(
    `SELECT c.full_name, c.email, c.cnic, c.uuid AS candidate_uuid,
            o.title AS opening_title, o.uuid AS opening_uuid,
            dg.name AS designation, dp.name AS department,
            org.name AS organization_name
       FROM candidates c
       JOIN job_openings o ON o.uuid=c.job_opening_uuid AND o.organization_id=c.organization_id
       JOIN organizations org ON org.id=c.organization_id
       LEFT JOIN designations dg ON dg.id=o.designation_id
       LEFT JOIN departments dp ON dp.id=o.department_id
      WHERE c.uuid=? AND c.organization_id=?`, [candidateUuid, orgId]);
  if (!context) throw new ApiError(404, "Candidate not found in this organization");
  return { candidate, context };
}

function offerDefaults(context) {
  const stableDate = new Date().toISOString().slice(0, 10);
  return {
    employee_name: context.full_name,
    designation: context.designation ?? "",
    department: context.department ?? "",
    joining_date: "",
    cnic: context.cnic ?? "",
    organization_name: context.organization_name,
    issue_date: stableDate,
    letter_date: stableDate,
    reference_no: `OFR-${String(context.candidate_uuid).slice(0, 8).toUpperCase()}`,
    new_salary: "",
  };
}

export async function getOfferPreparation({ orgId, candidateUuid, conn = pool }) {
  const { candidate, context } = await offerContext({ orgId, candidateUuid, conn });
  if (!["selected", "offered"].includes(candidate.stage)) throw new ApiError(409, "Select the candidate before preparing an offer");
  const [finalInterviews] = await conn.query(
    "SELECT outcome FROM interviews WHERE organization_id=? AND candidate_uuid=? AND status='completed' ORDER BY scheduled_at DESC, id DESC LIMIT 1",
    [orgId, candidateUuid],
  );
  const templates = await listTemplates({ orgId, letterType: "offer" });
  return {
    candidate: { uuid: candidate.uuid, full_name: candidate.full_name, email: candidate.email, cnic: candidate.cnic, final_interview_outcome: finalInterviews[0]?.outcome ?? null },
    opening: { uuid: context.opening_uuid, title: context.opening_title, designation: context.designation, department: context.department },
    templates,
    merge_tags: tagsForLetterType("offer").map((item) => ({ ...item, label: tagLabel(item.tag, "offer") })),
    default_values: { ...offerDefaults(context), ...parseOfferValues(candidate.offer_values) },
    selected_template_uuid: candidate.offer_template_uuid ?? null,
  };
}

export async function previewOffer({ orgId, candidateUuid, templateUuid, values = {}, conn = pool }) {
  const { candidate, context } = await offerContext({ orgId, candidateUuid, conn });
  if (!["selected", "offered"].includes(candidate.stage)) throw new ApiError(409, "Select the candidate before preparing an offer");
  const template = await getTemplate({ orgId, templateUuid });
  if (template.letter_type !== "offer") throw new ApiError(400, "Choose an Offer Letter template. Other HR letter types cannot be used for recruitment offers.");
  if (!template.is_active) throw new ApiError(409, "This offer template is inactive");
  const compatible = validateBody(template.body, "offer");
  if (!compatible.valid) throw new ApiError(400, compatible.problems.join("; "));
  if (!compatible.tags.includes("new_salary")) throw new ApiError(400, "Offer Letter templates must include $new_salary so the approved offer and the employee payroll setup contain the same salary term.");
  const supplied = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    const tag = key.toLowerCase();
    if (!OFFER_INPUT_TAGS.has(tag)) continue;
    supplied[tag] = String(value ?? "").trim();
    if (supplied[tag].length > 500) throw new ApiError(400, `${tagLabel(tag, "offer")} must be 500 characters or fewer`);
  }
  const resolvedValues = { ...offerDefaults(context), ...supplied };
  // These values are authoritative and cannot be overridden by client input.
  resolvedValues.employee_name = context.full_name;
  resolvedValues.organization_name = context.organization_name;
  resolvedValues.issue_date = new Date().toISOString().slice(0, 10);
  resolvedValues.letter_date = resolvedValues.issue_date;
  resolvedValues.reference_no = `OFR-${String(candidate.uuid).slice(0, 8).toUpperCase()}`;
  const { text, unresolved } = renderTemplate(template.body, resolvedValues);
  const tagCatalog = new Map(tagsForLetterType("offer").map((tag) => [tag.tag, tag]));
  return {
    template_uuid: template.uuid,
    template_name: template.name,
    template_body: template.body,
    template_hash: createHash("sha256").update(template.body).digest("hex"),
    values: resolvedValues,
    rendered_body: text,
    unresolved: [...new Set(unresolved)],
    unknown: [...compatible.tags.filter((tag) => !tagCatalog.has(tag)), ...unsupportedTags(template.body, "offer")],
    required_tags: compatible.tags,
    missing_fields: [...new Set(unresolved)].map((tag) => ({ tag, label: tagLabel(tag, "offer"), source: tagCatalog.get(tag)?.source ?? "unsupported" })),
  };
}

/** The (module_key, entity_type) pair offers register under. */
export const OFFER_APPROVAL = {
  moduleKey: "recruitment_management",
  entityType: "candidate_offer",
};

/**
 * Submit a drafted appointment letter for approval.
 *
 * THE STAGE GATE IS `hired`, NOT `offered` — and that is the whole point of the
 * lifecycle being post-hire.
 *
 * An offer letter is created by `hireCandidate`, in the same transaction that creates
 * the employee row. So a candidate who has not been hired has no letter to approve,
 * and gating on `offered` allowed exactly the sequence that cannot work: approve an
 * offer, then discover `sendOffer` refuses it with 409 because there is nothing to
 * send. The flow is therefore:
 *
 *     hired (employee record + DRAFT appointment letter)
 *       -> submitted for approval
 *       -> approved
 *       -> sent/issued (mints the reference number and the QR token)
 *
 * The candidate signs the issued letter and joins on `joining_date`, which is a
 * separate field from the hire date — so issuing a letter after the record exists is
 * not "late", it is the ordinary sequence for a start date in the future.
 */
export async function requestOfferApproval({
  orgId,
  actorUuid,
  candidateUuid,
  comments,
  conn = pool,
}) {
  const candidate = await loadCandidate({ orgId, candidateUuid, conn });

  if (!["selected", "offered"].includes(candidate.stage)) {
    throw new ApiError(409, "Select the candidate before submitting an offer");
  }
  if (candidate.offer_status !== "draft") {
    throw new ApiError(409, "Prepare and validate the offer draft before submitting it for approval");
  }
  if (!candidate.offer_template_uuid || !candidate.offer_body_snapshot || !candidate.offer_snapshot_hash) {
    throw new ApiError(409, "Choose an Offer Letter template and complete all required offer fields before approval");
  }
  const offerTemplate = await getTemplate({ orgId, templateUuid: candidate.offer_template_uuid });
  if (offerTemplate.letter_type !== "offer") throw new ApiError(400, "Only Offer Letter templates can be submitted for recruitment approval");
  const templateCheck = validateBody(offerTemplate.body, "offer");
  if (!templateCheck.valid) throw new ApiError(400, templateCheck.problems.join("; "));
  const savedValues = parseOfferValues(candidate.offer_values);
  const savedRender = renderTemplate(offerTemplate.body, savedValues);
  const savedHash = createHash("sha256").update(stableJson({ template_uuid: candidate.offer_template_uuid, values: savedValues, body: candidate.offer_body_snapshot })).digest("hex");
  const savedTemplateHash = createHash("sha256").update(offerTemplate.body).digest("hex");
  if (savedRender.unresolved.length || savedRender.text !== candidate.offer_body_snapshot || savedHash !== candidate.offer_snapshot_hash || savedTemplateHash !== candidate.offer_template_hash) {
    throw new ApiError(409, "The offer snapshot is incomplete or changed. Reopen the draft, review its preview and try again.");
  }

  const { startApproval } = await import("./approvalWorkflow.service.js");
  await startApproval({
    orgId,
    moduleKey: OFFER_APPROVAL.moduleKey,
    entityType: OFFER_APPROVAL.entityType,
    entityUuid: candidate.uuid,
    requestedByUuid: actorUuid,
    title: `Offer — ${candidate.full_name}`,
    payload: {
      candidate_uuid: candidate.uuid,
      candidate_name: candidate.full_name,
      opening_uuid: candidate.job_opening_uuid,
      opening_title: candidate.opening_title ?? null,
      offer_letter_uuid: candidate.offer_letter_uuid,
      offer_template_uuid: candidate.offer_template_uuid,
      offer_template_hash: candidate.offer_template_hash,
      offer_values: parseOfferValues(candidate.offer_values),
      rendered_body: candidate.offer_body_snapshot,
      snapshot_hash: candidate.offer_snapshot_hash,
      comments: comments ?? null,
    },
  });
  await conn.query(
    "UPDATE candidates SET offer_status='pending_approval', updated_at=NOW() WHERE uuid=? AND organization_id=?",
    [candidate.uuid, orgId]
  );

  logAudit({
    actorType: "user",
    actorId: actorUuid ?? null,
    action: "candidate.offer.approval.request",
    entityType: ATTACHMENT_ENTITY.CANDIDATE,
    entityId: candidate.uuid,
    details: { stage: candidate.stage },
  });

  return getOfferApproval({ orgId, candidateUuid, conn });
}

/**
 * Approve or reject a submitted appointment letter.
 *
 * ON REJECT THE CANDIDATE IS **NOT** MOVED OUT OF `hired`. The earlier version moved
 * them to `rejected`, which was correct while approval was a pre-hire step, and is
 * wrong now that it is post-hire: this candidate already HAS an employee record and a
 * payroll identity, and flipping their pipeline stage to `rejected` would leave the
 * roster claiming someone does not exist who has a CNIC, a designation and a payslip.
 *
 * So a rejection now means exactly what it says — "this letter's terms are wrong" —
 * and leaves the hire intact. The reason is recorded on the CANDIDATE (still
 * `hired`, so the board keeps showing them) and in the approval's outcome notes, and
 * the recruiter reverts the letter to draft and submits again. What the letter needs
 * fixing and whether the person should be employed are two separate questions, and
 * conflating them is how a rejected offer letter used to delete a real hire.
 */
export async function decideOfferApproval({
  orgId,
  actorUuid,
  candidateUuid,
  decision,
  comments,
  conn = pool,
}) {
  if (!["approve", "reject"].includes(decision)) {
    throw new ApiError(400, "decision must be approve or reject");
  }
  const candidate = await loadCandidate({ orgId, candidateUuid, conn });

  const approval = await getOfferApproval({ orgId, candidateUuid, conn });
  if (!approval) throw new ApiError(404, "This offer has not been submitted for approval");
  if (approval.status !== "pending") {
    throw new ApiError(409, `This offer approval was already ${approval.status}`);
  }

  const { decideApproval } = await import("./approvalWorkflow.service.js");
  await decideApproval({
    orgId,
    requestUuid: approval.uuid,
    actorUuid,
    decision,
    comments: comments ?? null,
  });
  await conn.query(
    "UPDATE candidates SET offer_status=?, updated_at=NOW() WHERE uuid=? AND organization_id=?",
    [decision === "approve" ? "approved" : "rejected", candidate.uuid, orgId]
  );

  if (decision === "reject") {
    // Appended to any existing notes rather than replacing them: the recruiter's own
    // notes are the only record of how this hire was reached, and overwriting them
    // with a letter-terms comment would destroy that.
    const reason = comments?.trim() || "The appointment letter was rejected in approval";
    const merged = candidate.notes ? `${candidate.notes}\n\n${reason}` : reason;
    await conn.query(
      `UPDATE candidates SET \`notes\` = ?, updated_at = NOW() WHERE uuid = ? AND organization_id = ?`,
      [merged, candidate.uuid, orgId]
    );
  }

  logAudit({
    actorType: "user",
    actorId: actorUuid ?? null,
    action: `candidate.offer.approval.${decision}`,
    entityType: ATTACHMENT_ENTITY.CANDIDATE,
    entityId: candidate.uuid,
    details: { approval_request_uuid: approval.uuid },
  });

  return getOfferApproval({ orgId, candidateUuid, conn });
}

/**
 * The offer's approval record, shaped for ApprovalTimeline.
 *
 * `steps` and `currentStepOrder` are the component's exact prop names, because
 * getApprovalStatus already returns those keys from the append-only history. No
 * mapping layer, so nothing here can drift from what the component renders.
 *
 * Loads the candidate first so an unknown uuid 404s here rather than resolving to a
 * null approval that the UI would render as "no approval yet" for someone else's row.
 */
export async function getOfferApproval({ orgId, candidateUuid, conn = pool }) {
  await loadCandidate({ orgId, candidateUuid, conn });
  const { getApprovalStatus } = await import("./approvalWorkflow.service.js");
  const record = await getApprovalStatus({
    orgId,
    entityType: OFFER_APPROVAL.entityType,
    entityUuid: candidateUuid,
  });
  if (!record) return null;

  return {
    uuid: record.uuid,
    status: record.status,
    title: record.title,
    requested_at: record.requested_at,
    resolved_at: record.resolved_at,
    resolved_by_uuid: record.resolved_by_uuid,
    outcome_notes: record.outcome_notes,
    // The ApprovalTimeline prop names, verbatim.
    steps: record.history ?? [],
    currentStepOrder: record.current_step_order ?? null,
    current_step_name: record.current_step_name ?? null,
    payload: parseOfferValues(record.payload),
  };
}

// ===========================================================================
// Interviews
// ===========================================================================

export async function scheduleInterview({
  orgId,
  actorUuid,
  candidateUuid,
  interviewerUuid,
  scheduledAt,
  mode,
  location,
  conn = pool,
}) {
  if (!isValidDateTime(scheduledAt)) {
    throw new ApiError(400, "scheduled_at must be a valid date and time");
  }

  const candidate = await loadCandidate({ orgId, candidateUuid, conn });

  // Booking someone for an interview while they are still in `applied` records a
  // conversation that has not happened. The recruiter should move them to the
  // interview stage first, which is also what makes the pipeline board honest.
  if (["applied", "screening"].includes(candidate.stage)) {
    throw new ApiError(
      409,
      `Move this candidate to the interview stage before scheduling them for one (they are at "${candidate.stage}")`,
    );
  }
  if (["hired", "rejected"].includes(candidate.stage)) {
    throw new ApiError(409, `A candidate who is already ${candidate.stage} cannot be interviewed`);
  }

  if (interviewerUuid) {
    assertUuid(interviewerUuid, "Interviewer UUID");
  }

  const uuid = randomUUID();
  try {
    await conn.query(
      `INSERT INTO interviews
         (uuid, organization_id, candidate_uuid, interviewer_uuid, scheduled_at,
          mode, location, created_by_uuid, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        uuid,
        orgId,
        candidateUuid,
        interviewerUuid ?? null,
        new Date(scheduledAt),
        mode ?? null,
        location ? String(location).trim() : null,
        actorUuid ?? null,
      ]
    );
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") {
      // The interviewer/slot unique key. Saying so is more useful than 500, and
      // naming the interviewer is the part the user needs to change.
      throw new ApiError(
        409,
        "That interviewer already has an interview booked at this time",
      );
    }
    throw e;
  }

  logAudit({
    actorType: "user",
    actorId: actorUuid ?? null,
    action: "interview.schedule",
    entityType: "interview",
    entityId: uuid,
    details: { candidate_uuid: candidateUuid, scheduled_at: scheduledAt },
  });

  return getInterview({ orgId, interviewUuid: uuid, conn });
}

async function loadInterview({ orgId, interviewUuid, conn = pool, forUpdate = false }) {
  assertUuid(interviewUuid, "Interview UUID");
  const [rows] = await conn.query(
    `SELECT * FROM interviews WHERE uuid=? AND organization_id=?${forUpdate ? " FOR UPDATE" : ""}`,
    [interviewUuid, orgId]
  );
  if (!rows.length) throw new ApiError(404, "Interview not found in this organization");
  return rows[0];
}

export async function getInterview({ orgId, interviewUuid, conn = pool }) {
  const interview = await loadInterview({ orgId, interviewUuid, conn });
  const [cands] = await conn.query(
    "SELECT uuid, full_name FROM candidates WHERE uuid=? AND organization_id=?",
    [interview.candidate_uuid, orgId]
  );
  return {
    ...interview,
    candidate: cands[0] ?? null,
    rating: interview.rating === null ? null : money(interview.rating),
  };
}

/**
 * Interviews, paged.
 *
 * PAGED, AND THAT IS A REVERSAL. The previous version returned every interview and
 * argued both of its two callers were "a screen at most". The first part is true of
 * today and the second part is the bug: an org that has run recruitment for a year
 * has thousands of COMPLETED interviews, and the unfiltered call the agenda page
 * makes would fetch all of them to show the handful that are still upcoming.
 *
 * The fix is not only the LIMIT — it is also the ORDER. `ORDER BY scheduled_at ASC`
 * means an unfiltered agenda's first page is the OLDEST interviews, which is the
 * opposite of what an agenda needs: today's meeting should be on page 1. So the
 * default ordering is `scheduled_at DESC` (newest first, matching every other list in
 * this module) and the frontend sorts its single page client-side into upcoming and
 * past. Paging DESC keeps a growing history from pushing today's meetings onto page
 * 40, and the candidate-history read — which is filtered to one candidate and so is
 * tiny — gets the same order and sorts fine.
 *
 * The `total` count reuses the SAME WHERE clause as the page query, so the page
 * count cannot disagree with what a page actually contains.
 */
export async function listInterviews({
  orgId,
  candidateUuid,
  interviewerUuid,
  page = 1,
  limit = 20,
  offset = 0,
  conn = pool,
}) {
  const clauses = ["i.organization_id = ?"];
  const params = [orgId];
  if (candidateUuid) {
    assertUuid(candidateUuid, "Candidate UUID");
    clauses.push("i.candidate_uuid = ?");
    params.push(candidateUuid);
  }
  if (interviewerUuid) {
    assertUuid(interviewerUuid, "Interviewer UUID");
    clauses.push("i.interviewer_uuid = ?");
    params.push(interviewerUuid);
  }
  const where = clauses.join(" AND ");

  // Derived rather than trusted — see listOpenings for why: passing `page` without
  // `offset` yields page 1 forever, which is indistinguishable from correct paging
  // until the second request.
  const effectiveOffset = offset || (page - 1) * limit;

  const [[{ total }]] = await conn.query(
    `SELECT COUNT(*) AS total FROM interviews i WHERE ${where}`,
    params
  );

  const [rows] = await conn.query(
    `SELECT i.*, c.full_name AS candidate_name
       FROM interviews i
       LEFT JOIN candidates c
         ON c.uuid = i.candidate_uuid AND c.organization_id = i.organization_id
      WHERE ${where}
      ORDER BY i.scheduled_at DESC, i.created_at DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, effectiveOffset]
  );

  return {
    items: rows.map((r) => ({ ...r, rating: r.rating === null ? null : money(r.rating) })),
    total: Number(total),
    page,
    limit,
  };
}

/**
 * Record an outcome for a scheduled interview.
 *
 * Feedback is only accepted on a COMPLETED interview. Writing notes against a
 * meeting that has not happened is how a decision gets recorded without anyone
 * having actually met, which is the failure this whole module exists to prevent.
 */
export async function recordInterviewFeedback({
  orgId,
  actorUuid,
  interviewUuid,
  status,
  outcome,
  rating,
  feedbackNotes,
  conn = pool,
}) {
  const interview = await loadInterview({ orgId, interviewUuid, conn, forUpdate: true });

  if (status === "cancelled") {
    if (outcome && outcome !== "pending") {
      throw new ApiError(400, "A cancelled interview cannot have a pass/fail outcome");
    }
  } else {
    if (interview.status === "completed") {
      throw new ApiError(409, "This interview's feedback has already been recorded");
    }
    if (!["completed", "scheduled"].includes(status ?? "completed")) {
      throw new ApiError(400, `status must be one of: ${INTERVIEW_STATUSES.join(", ")}`);
    }
  }

  const nextStatus = status ?? "completed";
  const nextOutcome = nextStatus === "completed" ? outcome ?? "pending" : "pending";
  const mergedRating =
    rating === undefined ? interview.rating : ratingOrNull(rating);

  await conn.query(
    `UPDATE interviews
        SET status=?, outcome=?, \`rating\`=?, feedback_notes=?, updated_at=NOW()
      WHERE uuid=? AND organization_id=? AND status <> 'completed'`,
    [
      nextStatus,
      nextOutcome,
      mergedRating,
      feedbackNotes === undefined
        ? interview.feedback_notes
        : feedbackNotes
          ? String(feedbackNotes).trim()
          : null,
      interviewUuid,
      orgId,
    ]
  );

  logAudit({
    actorType: "user",
    actorId: actorUuid ?? null,
    action: "interview.feedback",
    entityType: "interview",
    entityId: interviewUuid,
    details: { status: nextStatus, outcome: nextOutcome },
  });

  return getInterview({ orgId, interviewUuid, conn });
}

// ===========================================================================
// Resumes, via the shared attachments table
// ===========================================================================

/**
 * Attach a resume to a candidate.
 *
 * entity_type='candidate', category='candidate_resume'. Same polymorphic pattern
 * the other modules use, so tenant scoping, the path-traversal guard, soft delete
 * and the audit entry all come from attachments.service.js instead of a second
 * implementation.
 *
 * candidates.resume_attachment_uuid records the CURRENT resume so the pipeline list
 * can show one without a join per row; every upload is still kept as its own
 * attachment, because "which version did we actually offer them on" is a question
 * this has to be able to answer.
 *
 * NOTE ON TRANSACTIONS. attachments.service.js takes no connection and writes on the
 * pool, so this row is not part of any transaction the caller runs. That is
 * acceptable and is not a shortcut: an attachment and a candidate are independent
 * records with no cross-table invariant, so the worst a failure produces is a
 * candidate whose resume did not attach.
 */
export async function attachResume({ orgId, actorUuid, candidateUuid, files, description }) {
  const candidate = await loadCandidate({ orgId, candidateUuid });

  const rows = await attachments.createAttachments({
    orgId,
    entityType: ATTACHMENT_ENTITY.CANDIDATE,
    entityUuid: candidate.uuid,
    uploadedByUuid: actorUuid ?? null,
    category: ATTACHMENT_CATEGORY.RESUME,
    description: description ?? null,
    files,
  });

  if (rows.length) {
    await pool.query(
      "UPDATE candidates SET resume_attachment_uuid=?, updated_at=NOW() WHERE uuid=? AND organization_id=?",
      [rows[0].uuid, candidate.uuid, orgId]
    );
  }

  logAudit({
    actorType: "user",
    actorId: actorUuid ?? null,
    action: "candidate.resume.attach",
    entityType: ATTACHMENT_ENTITY.CANDIDATE,
    entityId: candidate.uuid,
    details: { count: rows.length },
  });

  return rows;
}

export async function listResumes({ orgId, candidateUuid, conn = pool }) {
  return attachments.listAttachments({
    orgId,
    entityType: ATTACHMENT_ENTITY.CANDIDATE,
    entityUuid: candidateUuid,
    category: ATTACHMENT_CATEGORY.RESUME,
  });
}

export async function removeResume({ orgId, actorUuid, attachmentUuid, conn = pool }) {
  const [rows] = await conn.query(
    `SELECT uuid, entity_type, entity_uuid FROM attachments
      WHERE uuid=? AND organization_id=? AND deleted_at IS NULL`,
    [attachmentUuid, orgId]
  );
  if (!rows.length) throw new ApiError(404, "Attachment not found");
  // Not optional: removeAttachment scopes by organization only, so without this an
  // expense receipt or an invoice would be deletable through the recruitment
  // routes — one module reaching another module's files.
  if (rows[0].entity_type !== ATTACHMENT_ENTITY.CANDIDATE) {
    throw new ApiError(400, "That file does not belong to a candidate");
  }
  await loadCandidate({ orgId, candidateUuid: rows[0].entity_uuid, conn });

  // Clear the pointer only if it pointed at this file, so removing an older resume
  // does not blank the current one.
  await conn.query(
    "UPDATE candidates SET resume_attachment_uuid=NULL, updated_at=NOW() WHERE uuid=? AND organization_id=? AND resume_attachment_uuid=?",
    [rows[0].entity_uuid, orgId, attachmentUuid]
  );

  return attachments.removeAttachment({ orgId, attachmentUuid, actorUuid });
}

export function downloadResume({ orgId, attachmentUuid }) {
  return attachments.resolveForDownload({ orgId, attachmentUuid });
}

/**
 * Parse a resume/CV file and extract candidate fields.
 *
 * Calls the shared Python document service (POST /ocr/extract) with the
 * "resume" schema (name, cnic, designation). Returns only fields the OCR
 * service actually extracts — email, phone, cover_letter, and notes are
 * NOT extracted (no parser exists for those). The caller must clean up
 * the temporary file after this function resolves.
 */
export async function parseResumeFile({ filePath }) {
  const { data } = await ocrExtract(filePath, "resume");
  const fields = data.fields || {};
  return {
    name: fields.name?.value ?? null,
    name_confidence: fields.name?.confidence ?? null,
    cnic: fields.cnic?.value ?? null,
    cnic_confidence: fields.cnic?.confidence ?? null,
    designation: fields.designation?.value ?? null,
    designation_confidence: fields.designation?.confidence ?? null,
  };
}

// ===========================================================================
// Pipeline board
// ===========================================================================

/**
 * The pipeline as columns, for a Kanban board.
 *
 * Counted in the database rather than by fetching every candidate and counting in
 * JavaScript: a busy opening has thousands of applications and the board only
 * needs the shape of it.
 */
export async function getPipelineBoard({ orgId, openingUuid, conn = pool }) {
  const opening = await loadOpening({ orgId, openingUuid, conn });
  const [counts] = await conn.query(
    `SELECT stage, COUNT(*) AS n FROM candidates
      WHERE organization_id=? AND job_opening_uuid=?
      GROUP BY stage`,
    [orgId, openingUuid]
  );

  const byStage = new Map(counts.map((r) => [r.stage, Number(r.n)]));
  return {
    opening,
    columns: PIPELINE_FLOW.map((stage) => ({
      stage,
      count: byStage.get(stage) ?? 0,
    })),
    // Rejected sits outside the forward flow — it is where candidates leave the
    // pipeline, not a step they walk through.
    rejected_count: byStage.get("rejected") ?? 0,
  };
}
// ---------------------------------------------------------------------------
// Starting an offer — the ONE action that puts a person on the roster
// ---------------------------------------------------------------------------

/**
 * START AN OFFER: hire the candidate AND submit their letter for approval.
 *
 * THIS IS THE ENTRY POINT TO THE MODULE, AND IT EXISTS BECAUSE `hireCandidate` ON ITS
 * OWN WAS THE GAP.
 *
 * What the UI used to do was call `hireCandidate` directly from a button on the
 * pipeline's Offered card. That function creates the employee record and drafts the
 * letter — and then stops. Nothing submitted the letter anywhere. So the observed
 * outcome was exactly what a real test found: a person on the payroll whose offer was
 * never sent, never approved, and never would be, because every remaining step lived
 * on a different screen that nothing pointed them to. The employee record is the one
 * write in this module that cannot be undone from the UI, and it was the one write
 * with no enforced follow-up.
 *
 * So the two writes are now one action with one name. `hireCandidate` stays exactly as
 * it is — a single atomic hire, still used directly by tests and by any caller that
 * genuinely wants a bare hire — but the PIPELINE calls this instead, because a hire
 * reached from a pipeline card is always the first half of an offer.
 *
 * ORDER IS LOAD-BEARING, AND IT IS THE OTHER WAY ROUND FROM WHAT IT LOOKS LIKE:
 * hire FIRST, then start the approval.
 *
 *   - The approval must be post-hire. `requestOfferApproval` gates on `hired`, because
 *     the letter it approves is created by the hire. So approval cannot go first.
 *   - Therefore the workflow is PREFLIGHTED before the hire. `preflightApproval` does
 *     the exact checks `startApproval` does — workflow exists, has steps, first step
 *     has an approver — without writing anything. That closes the window in which a
 *     misconfigured workflow would leave an orphaned employee, which is the failure
 *     this function is for.
 *
 * IF THE APPROVAL STILL FAILS AFTER A COMMITTED HIRE, the failure is reported as the
 * recoverable state it actually is, rather than hidden or half-rolled-back: the
 * employee exists and the letter is drafted, so the Offers tab shows the row with a
 * "Submit for approval" button and the recruiter finishes the job there. Rolling the
 * hire back would be worse — it would delete a real person to tidy up a workflow
 * misconfiguration, and `startApproval` writes on its own connection, so the approval
 * could not be rolled back with it anyway.
 */
export async function startCandidateOffer({
  orgId, actorUuid, candidateUuid, overrideFailedInterviewReason = null,
  overrideFailedInterviewAuthorized = false, offerTemplateUuid, offerValues = {}, conn = pool,
}) {
  assertUuid(candidateUuid, "Candidate UUID");
  const candidate = await loadCandidate({ orgId, candidateUuid, conn });
  if (!["selected", "offered"].includes(candidate.stage)) throw new ApiError(409, "Only a selected candidate can receive an offer");
  if (["pending_approval", "sent", "accepted", "declined"].includes(candidate.offer_status)) {
    throw new ApiError(409, "This offer cannot be changed in its current state");
  }
  if (!offerTemplateUuid) throw new ApiError(400, "Select an Offer Letter template before submitting for approval");
  const prepared = await previewOffer({ orgId, candidateUuid, templateUuid: offerTemplateUuid, values: offerValues, conn });
  if (prepared.unresolved.length) {
    const labels = prepared.missing_fields.map((field) => field.label);
    throw new ApiError(400, `Complete these offer fields before approval: ${[...new Set(labels)].join(", ")}`);
  }
  const preparedHash = createHash("sha256").update(stableJson({ template_uuid: prepared.template_uuid, values: prepared.values, body: prepared.rendered_body })).digest("hex");
  if (candidate.offer_status === "approved" && candidate.offer_snapshot_hash === preparedHash) {
    throw new ApiError(409, "This offer content is already approved and unchanged");
  }
  const [[opening]] = await conn.query(
    "SELECT interview_required FROM job_openings WHERE organization_id=? AND uuid=?",
    [orgId, candidate.job_opening_uuid]
  );
  const [interviews] = await conn.query(
    "SELECT outcome FROM interviews WHERE organization_id=? AND candidate_uuid=? AND status='completed' ORDER BY scheduled_at DESC, id DESC LIMIT 1",
    [orgId, candidate.uuid]
  );
  const finalOutcome = interviews[0]?.outcome ?? null;
  if (opening?.interview_required && finalOutcome !== "passed" && finalOutcome !== "failed") {
    throw new ApiError(409, "This opening requires a passed final interview before an offer can be prepared");
  }
  if (finalOutcome === "failed") {
    if (!overrideFailedInterviewAuthorized) throw new ApiError(403, "The final interview failed; an authorized exception with a reason is required");
    if (!overrideFailedInterviewReason?.trim()) throw new ApiError(400, "An override reason is required");
    if (overrideFailedInterviewReason.trim().length > 1000) throw new ApiError(400, "The interview override reason must be 1000 characters or fewer");
    await conn.query(
      "UPDATE candidates SET failed_interview_override_reason=?, failed_interview_override_by_uuid=?, failed_interview_override_at=NOW() WHERE uuid=? AND organization_id=?",
      [overrideFailedInterviewReason.trim(), actorUuid, candidate.uuid, orgId]
    );
  }
  const { preflightApproval } = await import("./approvalWorkflow.service.js");
  await preflightApproval({
    orgId, moduleKey: OFFER_APPROVAL.moduleKey, entityType: OFFER_APPROVAL.entityType,
    actorUuid, conn,
  });
  const offerValuesJson = JSON.stringify(prepared.values);
  const snapshotHash = createHash("sha256").update(stableJson({ template_uuid: prepared.template_uuid, values: prepared.values, body: prepared.rendered_body })).digest("hex");
  await conn.query(
    `UPDATE candidates
        SET offer_status='draft', offer_template_uuid=?, offer_values=?, offer_body_snapshot=?,
            offer_snapshot_hash=?, offer_template_hash=?, offer_snapshot_at=NOW(), updated_at=NOW()
      WHERE uuid=? AND organization_id=?`,
    [prepared.template_uuid, offerValuesJson, prepared.rendered_body, snapshotHash, prepared.template_hash, candidate.uuid, orgId]
  );
  const approval = await requestOfferApproval({ orgId, actorUuid, candidateUuid, conn });
  logAudit({ actorType: "user", actorId: actorUuid ?? null, action: "candidate.offer.start",
    entityType: ATTACHMENT_ENTITY.CANDIDATE, entityId: candidateUuid,
    details: { approval_request_uuid: approval?.uuid ?? null, interview_override: finalOutcome === "failed" } });
  return { candidate: await getCandidate({ orgId, candidateUuid, conn }), approval };
}
