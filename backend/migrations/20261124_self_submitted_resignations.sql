-- Only the employee linked to a roster record may create a resignation.
-- Org staff create termination requests through the managed offboarding workflow.
DROP TRIGGER IF EXISTS `bi_exit_requests_self_resignation`;
DELIMITER $$
CREATE TRIGGER `bi_exit_requests_self_resignation`
BEFORE INSERT ON `exit_requests`
FOR EACH ROW
BEGIN
  IF NEW.`request_type` = 'resignation' AND NOT EXISTS (
    SELECT 1 FROM `employees` e
     WHERE e.`uuid` = NEW.`employee_uuid`
       AND e.`organization_id` = NEW.`organization_id`
       AND e.`linked_user_uuid` = NEW.`created_by`
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Employees must submit their own resignation';
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS `bu_exit_requests_self_resignation`;
DELIMITER $$
CREATE TRIGGER `bu_exit_requests_self_resignation`
BEFORE UPDATE ON `exit_requests`
FOR EACH ROW
BEGIN
  IF NEW.`request_type` = 'resignation'
     AND (OLD.`request_type` <> NEW.`request_type`
       OR OLD.`employee_uuid` <> NEW.`employee_uuid`
       OR NOT (OLD.`created_by` <=> NEW.`created_by`))
     AND NOT EXISTS (
       SELECT 1 FROM `employees` e
        WHERE e.`uuid` = NEW.`employee_uuid`
          AND e.`organization_id` = NEW.`organization_id`
          AND e.`linked_user_uuid` = NEW.`created_by`
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Employees must submit their own resignation';
  END IF;
END$$
DELIMITER ;
