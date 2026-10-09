-- Employee portal invitation delivery state and organization-owned payroll policy.
-- Additive only: existing employee, invite, salary, leave and attendance data is preserved.

SET @ddl := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `invite_tokens` ADD COLUMN `delivery_status` ENUM(''pending'',''sent'',''failed'') NOT NULL DEFAULT ''sent'' AFTER `used_at`',
    'DO 0')
  FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='invite_tokens' AND column_name='delivery_status'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE `invite_tokens` ADD COLUMN `delivery_error` VARCHAR(500) NULL AFTER `delivery_status`',
    'DO 0')
  FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='invite_tokens' AND column_name='delivery_error'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- No organization gets an assumed deduction formula. Until an administrator
-- explicitly saves a complete policy, preview/generation must block payroll.
CREATE TABLE IF NOT EXISTS `organization_payroll_policies` (
  `organization_id` BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  `currency` CHAR(3) NULL,
  `pay_frequency` ENUM('weekly','biweekly','semi_monthly','monthly') NULL,
  `daily_rate_basis` ENUM('actual_working_days','calendar_days','fixed_30') NULL,
  `hours_per_workday` DECIMAL(5,2) NULL,
  `shift_start_time` TIME NULL,
  `late_grace_minutes` SMALLINT UNSIGNED NULL,
  `late_arrivals_per_penalty` SMALLINT UNSIGNED NULL,
  `late_penalty_days` DECIMAL(5,2) NULL,
  `overtime_multiplier` DECIMAL(5,2) NULL,
  `deduct_unpaid_leave` TINYINT(1) NULL,
  `deduct_absences` TINYINT(1) NULL,
  `deduct_late_arrivals` TINYINT(1) NULL,
  `pay_approved_overtime` TINYINT(1) NULL,
  `is_configured` TINYINT(1) NOT NULL DEFAULT 0,
  `configured_by_uuid` CHAR(36) NULL,
  `configured_at` DATETIME NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_payroll_policy_org` FOREIGN KEY (`organization_id`) REFERENCES `organizations` (`id`) ON DELETE CASCADE,
  INDEX `idx_payroll_policy_configured` (`is_configured`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
