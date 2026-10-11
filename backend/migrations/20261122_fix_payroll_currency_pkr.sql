-- Fix the payroll currency to PKR for every organization.
--
-- Currency used to be a free-text three-letter code that an administrator typed
-- into the payroll policy form. It is not a setting any more: this product pays
-- in Pakistani Rupees, so the value is now a constant in the application
-- (backend/src/utils/currency.js) and the form field has been removed.
--
-- Two things are done here, in this order:
--
--   1. Normalize any row that is NULL or holds something other than 'PKR'. A
--      legacy 'USD' or 'PKR ' must not survive into the payslip and salary
--      tables, which store money against whatever this column said.
--   2. Make the column NOT NULL DEFAULT 'PKR', so it can no longer be left
--      unset. This is deliberately a MODIFY rather than a CHECK constraint:
--      the schema enforces 'PKR' the same way `subscription_plans.free_plan_guard`
--      enforces its own invariant, which keeps this migration working on both
--      MySQL and MariaDB.
--
-- NOT destructive to policy data — every other policy column is untouched, and a
-- NOT NULL DEFAULT is added only after the backfill so the ALTER cannot fail on
-- an existing NULL.

UPDATE `organization_payroll_policies`
   SET `currency` = 'PKR'
 WHERE `currency` IS NULL
    OR `currency` <> 'PKR';

-- Add the NOT NULL DEFAULT only when the column is still nullable, so re-running
-- this file is a no-op rather than an error.
SET @ddl := (
  SELECT IF(IS_NULLABLE = 'YES',
    'ALTER TABLE `organization_payroll_policies` MODIFY COLUMN `currency` CHAR(3) NOT NULL DEFAULT ''PKR''',
    'DO 0')
  FROM information_schema.columns
  WHERE table_schema=DATABASE()
    AND table_name='organization_payroll_policies'
    AND column_name='currency'
);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;