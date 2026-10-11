-- Store payroll reimbursements separately from regular allowances.
ALTER TABLE `salary_records`
  ADD COLUMN `expense_reimbursement` DECIMAL(14,2) NOT NULL DEFAULT 0.00
  AFTER `deductions`;

-- Backfill salary records whose payslip already contains reimbursed claims.
UPDATE `salary_records` sr
   SET sr.`expense_reimbursement` = COALESCE((
         SELECT SUM(line.`amount`)
           FROM `salary_record_lines` line
          WHERE line.`salary_record_uuid` = sr.`uuid`
            AND line.`organization_id` = sr.`organization_id`
            AND line.`source` = 'auto_expense'
       ), 0.00)
 WHERE EXISTS (
         SELECT 1
           FROM `salary_record_lines` line
          WHERE line.`salary_record_uuid` = sr.`uuid`
            AND line.`organization_id` = sr.`organization_id`
            AND line.`source` = 'auto_expense'
       );

-- Include already reimbursed claims in historical net amounts as well.
UPDATE `salary_records`
   SET `net_salary` = GREATEST(
         0,
         ROUND(`basic_salary` + `allowances` + `expense_reimbursement` - `deductions`, 2)
       )
 WHERE `expense_reimbursement` > 0;
