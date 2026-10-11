-- ---------------------------------------------------------------------------
-- Auto-approval on expense claims.
--
-- A claim filed with the auto-approve box ticked by an authorized reviewer
-- lands on 'approved' immediately. That is a shortcut through the review queue,
-- so it has to be RECORDED AS ONE, not indistinguishable from a claim somebody
-- sat down and approved.
--
-- Two columns, because two facts need preserving:
--
--   auto_approved      whether the shortcut was used at all
--   auto_approved_by_uuid WHO ticked it
--
-- `reviewed_by_uuid` alone was considered and rejected. It would have made an
-- auto-approved claim look identical to a reviewed one: the audit log would show
-- the same approver, the same timestamp, and no way to answer "how many claims
-- skipped review?" - which is exactly the question someone asks after the number
-- turns out to be large. Approving at submission is not a decision; it is the
-- absence of one, and the storage says so.
--
-- Guarded so a re-run on a database that already has the columns is a no-op
-- rather than a failure.
SET @has_auto := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'expense_claims'
     AND COLUMN_NAME = 'auto_approved'
);
SET @ddl := IF(
  @has_auto = 0,
  'ALTER TABLE `expense_claims`
     ADD COLUMN `auto_approved` TINYINT(1) NOT NULL DEFAULT 0
       COMMENT ''1 when the claim was approved at submission by an authorized reviewer'',
     ADD COLUMN `auto_approved_by_uuid` CHAR(36) DEFAULT NULL
       COMMENT ''the user who requested the auto-approval; NOT the claimant''',
  'DO 0'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- The index is for the reporting question above: which claims bypassed review,
-- for which employee, in which month. Without it that query scans the table.
SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'expense_claims'
     AND INDEX_NAME = 'idx_expense_claims_auto_approved'
);
SET @ddl_idx := IF(
  @has_idx = 0,
  'CREATE INDEX `idx_expense_claims_auto_approved` ON `expense_claims` (`organization_id`, `auto_approved`, `expense_date`)',
  'DO 0'
);
PREPARE stmt_idx FROM @ddl_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;
