-- 2026-11-15 — Applicant tracking: job openings, candidates, interviews.
--
-- WHY THIS EXISTS. Hiring happened entirely outside the system. A CV arrived by
-- email, was read once, and either became an employee record typed in by hand or
-- vanished. Nothing recorded who applied, who was rejected, why, or which opening
-- any of it belonged to — so the only honest answer to "why is our attrition so
-- high" or "how many people did we interview for this role" was a spreadsheet
-- somebody maintained until they left.
--
-- Three tables. job_openings is what the company is recruiting FOR. candidates is
-- who applied. interviews is who was seen, when, and what was concluded.
--
-- THE INVARIANT THIS SCHEMA EXISTS TO ENFORCE: one candidate converts to at most
-- one employee.
--
-- The conversion from candidate to employee is the only irreversible step in the
-- module, and it is reachable by a single click that any two recruiters can press
-- on the same candidate at the same moment. Left unguarded that produces two
-- employee records, two payroll entries and one human being counted twice. The
-- guard is `converted_employee_uuid`, plus the WHERE clause on the UPDATE that
-- writes it: `AND converted_employee_uuid IS NULL AND stage = 'offered'`. Two
-- concurrent hires therefore cannot both win — the loser matches zero rows. See
-- hireCandidate() in recruitment.service.js, and the tests that exercise it.
--
-- Every statement is CREATE TABLE IF NOT EXISTS or a guarded ALTER, so the file is
-- re-runnable. That is not decoration: an earlier migration in this schema aborted
-- halfway through on a syntax error in a later statement, leaving the file neither
-- applied nor recorded.

-- ---------------------------------------------------------------------------
-- 0. Prerequisites on tables that already exist.
-- ---------------------------------------------------------------------------

-- (a) employees.cnic becomes NULLABLE.
--
-- WHY. Auto-onboarding creates the employee row from the candidate record at the
-- moment of hire, and a candidate frequently has no national ID at that point —
-- in this market CNIC issuance and verification are post-selection processes, and
-- demanding one to file an application would both deter candidates and collect a
-- high-value identifier long before there is a relationship to collect it under.
-- NOT NULL made the one-click hire fail outright with a raw MySQL error on exactly
-- the candidates most worth hiring.
--
-- SAFE TO RELAX, and checked rather than assumed: `cnic` carries no UNIQUE
-- constraint, no foreign key and no index of its own (verified against
-- SHOW INDEX FROM employees before this migration was written). So nulling it
-- weakens no uniqueness guarantee and orphans nothing. Making it nullable also
-- cannot lose data — widening a constraint never rewrites existing rows.
--
-- What it deliberately does NOT do is substitute a placeholder. Writing '' for a
-- candidate with no CNIC would satisfy NOT NULL and make "we don't know this yet"
-- indistinguishable from "we checked and it is blank" at the database level, which
-- is precisely the distinction HR needs to collect it later.
--
-- Guarded on IS_NULLABLE because a re-run must not fail, and because MODIFY
-- COLUMN has to restate the whole definition.
SET @ddl := (
  SELECT IF(
    IS_NULLABLE = 'YES',
    'DO 0',
    'ALTER TABLE `employees` MODIFY COLUMN `cnic` VARCHAR(20) NULL DEFAULT NULL'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'cnic'
  LIMIT 1
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- (b) Composite (organization_id, id) unique keys on departments and designations.
--
-- WHY. job_openings points at a department and a designation, and both are
-- org-scoped tables whose primary key is a bare auto-increment `id`. A plain
-- `FOREIGN KEY (department_id) REFERENCES departments(id)` would happily accept
-- department 41 from ANOTHER organization — a Lahore department on a Karachi
-- opening — because `id` is globally unique and says nothing about tenancy.
--
-- The fix is a composite foreign key over (organization_id, department_id), which
-- a foreign key can only declare if the parent has a matching unique index. That
-- index does not exist on either table yet, so it is added here.
--
-- Trivially satisfied, since `id` is already the primary key: no existing row can
-- violate it, and it therefore cannot fail on a populated table.
SET @ddl := (
  SELECT IF(
    COUNT(*) > 0,
    'DO 0',
    'ALTER TABLE `departments` ADD UNIQUE KEY `uk_departments_org_id` (`organization_id`, `id`)'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'departments'
    AND index_name = 'uk_departments_org_id'
  LIMIT 1
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) > 0,
    'DO 0',
    'ALTER TABLE `designations` ADD UNIQUE KEY `uk_designations_org_id` (`organization_id`, `id`)'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'designations'
    AND index_name = 'uk_designations_org_id'
  LIMIT 1
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 1. job_openings — what this org is recruiting for
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `job_openings` (
  `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid`            CHAR(36) NOT NULL,
  `organization_id` BIGINT UNSIGNED NOT NULL,
  `title`           VARCHAR(150) NOT NULL,
  -- department_id / designation_id, NOT department_uuid: departments and
  -- designations key on a surrogate `id`, and a uuid column that had to be looked
  -- up before use would be a second way to name the same row. Tenant safety comes
  -- from the composite foreign keys below, not from the column type.
  `department_id`   INT DEFAULT NULL,
  -- Carried onto the employee record on hire. Recorded HERE rather than being
  -- retyped at conversion, because the designation a candidate accepted is a
  -- property of the OFFER and must not be re-entered by a recruiter three weeks
  -- later from memory.
  `designation_id`  INT DEFAULT NULL,
  `location`        VARCHAR(120) DEFAULT NULL,
  -- 'temporary' is distinct from 'contract' on purpose: a temporary role ends on a
  -- date, a contract ends on an event, and collapsing them loses which one a
  -- vacancy actually is.
  `employment_type` ENUM('full_time','part_time','contract','internship','temporary')
                    NOT NULL DEFAULT 'full_time',
  `description`     TEXT,
  -- draft = not advertised yet, open = accepting applications, closed = no longer
  -- accepting but retained for the record of who applied. Closing never deletes,
  -- because a rejected candidate's evidence of having applied outlives the vacancy.
  `status`          ENUM('draft','open','closed') NOT NULL DEFAULT 'draft',
  -- The hiring budget for this role. Enforced in hireCandidate() rather than here,
  -- because counting hired candidates needs a subquery the CHECK constraint cannot
  -- express. Over-hiring is a money error, so it is checked rather than trusted.
  `vacancies`       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  -- Polymorphic over users/admin_profiles, so deliberately no foreign key: a hard
  -- FK to users(uuid) is what made platform-admin approvals fail in this schema
  -- before (see 20260821_audit_fixes.sql).
  `created_by_uuid` CHAR(36) DEFAULT NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_job_openings_uuid` (`uuid`),
  -- Needed by the composite tenant foreign keys below.
  UNIQUE KEY `uk_job_openings_org_uuid` (`organization_id`, `uuid`),
  -- Not unique: an org may legitimately have two "Software Engineer" openings, in
  -- different cities. A uniqueness rule here would force "Engineer (Lahore)" and
  -- "Engineer (Karachi)" naming as a workaround, which is worse than the
  -- duplicate it was meant to prevent.
  INDEX `idx_job_openings_org_status` (`organization_id`, `status`),
  CONSTRAINT `fk_job_openings_org`
    FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  -- ON DELETE RESTRICT on both: a department or designation that is still named by
  -- an opening cannot be deleted out from under it. Deleting the opening instead
  -- is always available, and losing the link silently would misfile every future
  -- hire from that opening.
  CONSTRAINT `fk_job_openings_department_tenant`
    FOREIGN KEY (`organization_id`, `department_id`)
    REFERENCES `departments` (`organization_id`, `id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_job_openings_designation_tenant`
    FOREIGN KEY (`organization_id`, `designation_id`)
    REFERENCES `designations` (`organization_id`, `id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 2. candidates — one row per person per application
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `candidates` (
  `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid`            CHAR(36) NOT NULL,
  `organization_id` BIGINT UNSIGNED NOT NULL,
  `job_opening_uuid` CHAR(36) NOT NULL,
  `full_name`       VARCHAR(150) NOT NULL,
  `email`           VARCHAR(190) DEFAULT NULL,
  `phone`           VARCHAR(30) DEFAULT NULL,
  -- Collected at hire, optional at application. See section 0(a) for why this is
  -- NULLABLE here and why no placeholder is written for it.
  `cnic`            VARCHAR(20) DEFAULT NULL,
  -- The resume, as an attachment row rather than a path column. See the note on
  -- entity_type in the attachments migration: one files table for every entity is
  -- what gives resumes tenant scoping, the traversal guard, soft delete and audit
  -- without a second implementation. entity_uuid has NO foreign key — it points at
  -- a different table per entity_type — so cross-tenant safety on this column is
  -- the service's job, not the schema's, and no FK is declared.
  `resume_attachment_uuid` CHAR(36) DEFAULT NULL,
  `cover_letter`    TEXT,
  -- The pipeline. `stage` is quoted in every query in the service not because this
  -- server needs it (it does not) but because STAGE is reserved in MySQL 8 and the
  -- same SQL has to run there.
  `stage`           ENUM('applied','screening','interview','offered','hired','rejected')
                    NOT NULL DEFAULT 'applied',
  -- Backticked throughout for the same reason: RATING became a reserved word in
  -- MySQL 8, so an unquoted column breaks on the target server while working
  -- locally, which is the worst possible combination to discover in production.
  `rating`          DECIMAL(3,2) DEFAULT NULL,
  `notes`           TEXT,
  -- A rejection without a reason is not actionable: the applicant is told nothing
  -- they can act on and the recruiter has to reconstruct it later.
  `rejected_reason` VARCHAR(500) DEFAULT NULL,
  -- THE ONE-SHOT HIRE GUARD. See the header. Non-null means this candidate already
  -- became an employee; the UPDATE that sets it also asserts it was still null, so
  -- two concurrent hires cannot both write one.
  `converted_employee_uuid` CHAR(36) DEFAULT NULL,
  -- The offer letter drafted as part of the hire. Recorded so the employee
  -- conversion and the letter are traceable to each other, and so a hire cannot
  -- silently skip the letter.
  `offer_letter_uuid` CHAR(36) DEFAULT NULL,
  `hired_at`        DATETIME DEFAULT NULL,
  `converted_at`    DATETIME DEFAULT NULL,
  `created_by_uuid` CHAR(36) DEFAULT NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_candidates_uuid` (`uuid`),
  UNIQUE KEY `uk_candidates_org_uuid` (`organization_id`, `uuid`),
  -- ONE application per person per opening. Without it the same person applied
  -- twice through the careers form and appears as two candidates who each occupy a
  -- pipeline slot — the board then shows one human being as two people and a
  -- vacancy looks half-filled that is not.
  --
  -- Scoped to (opening, email) rather than globally: the same email applying for a
  -- second role is a legitimate, common event, and must not be refused by a
  -- uniqueness rule written to stop the duplicate it cannot distinguish from it.
  UNIQUE KEY `uk_candidates_opening_email` (`job_opening_uuid`, `email`),
  -- The pipeline board reads by opening, filtered by stage, in stage order.
  INDEX `idx_candidates_opening_stage` (`organization_id`, `job_opening_uuid`, `stage`),
  -- Recruiter worklist: "my candidates, newest first", independent of opening.
  INDEX `idx_candidates_org_stage` (`organization_id`, `stage`, `created_at`),
  CONSTRAINT `fk_candidates_org`
    FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_candidates_opening_tenant`
    FOREIGN KEY (`organization_id`, `job_opening_uuid`)
    REFERENCES `job_openings` (`organization_id`, `uuid`) ON DELETE CASCADE,
  -- ON DELETE RESTRICT, not CASCADE: deleting an employee must not delete the
  -- evidence that they were once a candidate, because that record is what explains
  -- their joining date and original designation.
  CONSTRAINT `fk_candidates_converted_employee`
    FOREIGN KEY (`converted_employee_uuid`) REFERENCES `employees` (`uuid`)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- 3. interviews — who was seen, when, and what was concluded
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `interviews` (
  `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid`            CHAR(36) NOT NULL,
  -- Carried even though the specification did not ask for it. Without it, tenancy
  -- cannot be enforced by the database at all on this table and scoping every read
  -- to "the candidate's organization" means a join back through candidates on the
  -- hot path. It is also what lets the composite tenant foreign key below exist.
  `organization_id` BIGINT UNSIGNED NOT NULL,
  `candidate_uuid`  CHAR(36) NOT NULL,
  -- Polymorphic over users/admin_profiles, so no foreign key, for the same reason
  -- as created_by_uuid everywhere else in this schema.
  `interviewer_uuid` CHAR(36) DEFAULT NULL,
  `scheduled_at`    DATETIME NOT NULL,
  `mode`            ENUM('onsite','phone','video','other') DEFAULT NULL,
  `location`        VARCHAR(150) DEFAULT NULL,
  `feedback_notes`  TEXT,
  -- Rating of the INTERVIEW, kept separate from candidates.rating which is the
  -- candidate's overall standing. Overwriting one with the other is how a single
  -- enthusiastic interview becomes a hire with no dissent recorded.
  `rating`          DECIMAL(3,2) DEFAULT NULL,
  `status`          ENUM('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  -- Outcome is orthogonal to status: a completed interview has not yet concluded,
  -- and only then becomes passed or failed. Folding the two together would make
  -- "we met them, still deciding" inexpressible.
  `outcome`         ENUM('pending','passed','failed') NOT NULL DEFAULT 'pending',
  `created_by_uuid` CHAR(36) DEFAULT NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_interviews_uuid` (`uuid`),
  UNIQUE KEY `uk_interviews_org_uuid` (`organization_id`, `uuid`),
  -- Two interviewers cannot be double-booked into the same slot. A scheduling
  -- clash discovered on the interview day is a failure of the tool, and this is
  -- the cheapest possible place to refuse it.
  --
  -- Narrower than "no interview at this minute anywhere": the constraint is per
  -- interviewer, because two different interviewers meeting two different
  -- candidates at 10:00 is the normal case, not a clash.
  UNIQUE KEY `uk_interviews_interviewer_slot` (`organization_id`, `interviewer_uuid`, `scheduled_at`),
  -- "This candidate's interviews, soonest first" is the read the detail drawer
  -- makes on open.
  INDEX `idx_interviews_candidate` (`organization_id`, `candidate_uuid`, `scheduled_at`),
  -- The interviewer's own agenda across all candidates.
  INDEX `idx_interviews_interviewer` (`organization_id`, `interviewer_uuid`, `scheduled_at`),
  CONSTRAINT `fk_interviews_org`
    FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  -- CASCADE: an interview is a fact ABOUT a candidate. If the application is
  -- withdrawn, an interview record pointing at nothing is not a record of anything.
  -- The candidate's own history is preserved by never deleting the candidate while
  -- feedback still matters.
  CONSTRAINT `fk_interviews_candidate_tenant`
    FOREIGN KEY (`organization_id`, `candidate_uuid`)
    REFERENCES `candidates` (`organization_id`, `uuid`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;