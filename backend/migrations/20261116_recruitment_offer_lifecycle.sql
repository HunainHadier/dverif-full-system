-- Recruitment offer lifecycle and interview policy.
-- Additive only: preserves existing candidate, employee, interview and approval rows.
--
-- IDEMPOTENT. Every statement is wrapped in an information_schema guard, matching the
-- pattern already used by 20261107 and 20261118 in this migration set.
--
-- WHY: this file originally ran as bare `ALTER TABLE ... ADD COLUMN`, which is
-- exactly the shape MySQL has no tolerance for - there is no `ADD COLUMN IF NOT
-- EXISTS` in MySQL 8.0 CE, so a re-run aborts on the duplicate column and every
-- later statement in the file is never reached. That is not hypothetical here: this
-- file's columns were applied to some environments out-of-band and recorded as
-- applied in others, so the ledger and the schema could disagree. A migration whose
-- success depends on the ledger agreeing with the schema is a deployment that
-- fails on exactly the environments where somebody already ran it manually.
--
-- Columns are added one statement at a time rather than as one multi-column ALTER.
-- That is what makes a PARTIALLY applied file re-runnable: a single multi-column
-- ALTER fails wholesale if any one column is present, whereas per-column guards
-- skip what exists and add only what is missing.
--
-- Column ORDER may differ from a single combined ALTER. Nothing references these
-- columns positionally, so this is cosmetic.

-- ---------------------------------------------------------------------------
-- 1. Opening-level interview policy
-- ---------------------------------------------------------------------------
SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `job_openings` ADD COLUMN `interview_required` TINYINT(1) NOT NULL DEFAULT 0 AFTER `vacancies`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'job_openings'
    AND column_name = 'interview_required'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 2. Candidate offer lifecycle columns
-- ---------------------------------------------------------------------------

-- The stage enum itself is widened rather than added, and MODIFY is naturally
-- re-runnable, so it needs no guard. It is left first because the columns added
-- below describe the offer lifecycle whose terminal state this stage set defines.
ALTER TABLE `candidates`
  MODIFY COLUMN `stage` ENUM(
    'applied','screening','interview','selected','offered',
    'hired','declined','rejected'
  ) NOT NULL DEFAULT 'applied';

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `offer_status` ENUM(''draft'',''pending_approval'',''approved'',''sent'',''accepted'',''declined'',''rejected'') NULL DEFAULT NULL AFTER `offer_letter_uuid`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'offer_status'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `offer_sent_at` DATETIME NULL AFTER `offer_status`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'offer_sent_at'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `offer_response_at` DATETIME NULL AFTER `offer_sent_at`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'offer_response_at'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `offer_response_notes` VARCHAR(1000) NULL AFTER `offer_response_at`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'offer_response_notes'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `offer_template_uuid` CHAR(36) NULL AFTER `offer_response_notes`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'offer_template_uuid'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `offer_values` JSON NULL AFTER `offer_template_uuid`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'offer_values'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `offer_body_snapshot` MEDIUMTEXT NULL AFTER `offer_values`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'offer_body_snapshot'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `offer_snapshot_hash` CHAR(64) NULL AFTER `offer_body_snapshot`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'offer_snapshot_hash'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `offer_template_hash` CHAR(64) NULL AFTER `offer_snapshot_hash`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'offer_template_hash'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `offer_snapshot_at` DATETIME NULL AFTER `offer_snapshot_hash`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'offer_snapshot_at'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 3. Failed-final-interview override, attributed and auditable
-- ---------------------------------------------------------------------------
SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `failed_interview_override_reason` VARCHAR(1000) NULL AFTER `offer_response_notes`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'failed_interview_override_reason'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `failed_interview_override_by_uuid` CHAR(36) NULL AFTER `failed_interview_override_reason`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'failed_interview_override_by_uuid'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD COLUMN `failed_interview_override_at` DATETIME NULL AFTER `failed_interview_override_by_uuid`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND column_name = 'failed_interview_override_at'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 4. Index + foreign key for the override author
-- ---------------------------------------------------------------------------
SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD KEY `idx_candidates_offer_status` (`organization_id`, `offer_status`, `updated_at`)',
    'DO 0'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND index_name = 'idx_candidates_offer_status'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `candidates` ADD CONSTRAINT `fk_candidates_interview_override_by` FOREIGN KEY (`failed_interview_override_by_uuid`) REFERENCES `users` (`uuid`) ON DELETE SET NULL',
    'DO 0'
  )
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'candidates'
    AND constraint_name = 'fk_candidates_interview_override_by'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;