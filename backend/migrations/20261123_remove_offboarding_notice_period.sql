-- Replace manually entered contractual notice values with a date-derived countdown.
-- The countdown is calculated from the request date and last_working_day at read time.
ALTER TABLE `exit_requests`
  DROP COLUMN `notice_period_days`;

-- Notice shortfall recovery is no longer part of final settlement calculations.
ALTER TABLE `final_settlements`
  DROP COLUMN `notice_period_days`,
  DROP COLUMN `notice_days_served`,
  DROP COLUMN `notice_pay_adjustment`;
