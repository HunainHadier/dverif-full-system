-- Complete the core employment profile while preserving existing roster rows.
--
-- IDEMPOTENT. Every DDL statement is wrapped in an information_schema guard,
-- matching the pattern already used by 20261107 and 20261118 in this set.
--
-- WHY: MySQL 8.0 CE has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so this
-- file's original bare multi-column ALTER aborted on the duplicate column the
-- moment it was re-run against an environment where it had already been applied
-- - and because the column, key and constraint all lived in ONE statement, that
-- abort also meant the remaining statements were never reached. Splitting the
-- ALTER per object is what makes a partially applied file resumable rather than
-- permanently stuck.

-- ---------------------------------------------------------------------------
-- 1. Core employment profile columns
-- ---------------------------------------------------------------------------
SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `employees` ADD COLUMN `employee_code` VARCHAR(30) NULL AFTER `uuid`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'employee_code'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `employees` ADD COLUMN `employment_type` ENUM(''full_time'',''part_time'',''contract'',''temporary'',''intern'') NULL AFTER `joining_date`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'employment_type'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `employees` ADD COLUMN `work_location` VARCHAR(150) NULL AFTER `employment_type`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'work_location'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `employees` ADD COLUMN `reporting_manager_uuid` CHAR(36) NULL AFTER `work_location`',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND column_name = 'reporting_manager_uuid'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 2. Keys and the reporting-line foreign key
-- ---------------------------------------------------------------------------
SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `employees` ADD UNIQUE KEY `uk_employees_org_code` (`organization_id`, `employee_code`)',
    'DO 0'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND index_name = 'uk_employees_org_code'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `employees` ADD KEY `idx_employees_reporting_manager` (`reporting_manager_uuid`)',
    'DO 0'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND index_name = 'idx_employees_reporting_manager'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @ddl := (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `employees` ADD CONSTRAINT `fk_employees_reporting_manager` FOREIGN KEY (`reporting_manager_uuid`) REFERENCES `employees` (`uuid`) ON DELETE SET NULL',
    'DO 0'
  )
  FROM information_schema.table_constraints
  WHERE table_schema = DATABASE()
    AND table_name = 'employees'
    AND constraint_name = 'fk_employees_reporting_manager'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- 3. Backfill a stable internal identifier for existing rows.
--
-- Naturally re-runnable: the WHERE clause excludes rows that already have a code,
-- so a second pass matches nothing. This is additive metadata only; it does not
-- change employee/user identity or lifecycle state.
-- ---------------------------------------------------------------------------
UPDATE employees SET employee_code=CONCAT('EMP-', LPAD(id, 6, '0')) WHERE employee_code IS NULL;