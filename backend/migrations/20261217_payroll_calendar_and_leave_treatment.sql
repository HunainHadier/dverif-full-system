-- Payroll calendar and per-request leave treatment.
ALTER TABLE leave_requests
  ADD COLUMN requested_treatment ENUM('paid','unpaid') NOT NULL DEFAULT 'unpaid',
  ADD COLUMN approved_treatment ENUM('paid','unpaid') NULL;

CREATE TABLE IF NOT EXISTS organization_payroll_settings (
  organization_id INT NOT NULL,
  salary_calculation_method ENUM('hours','days') NOT NULL DEFAULT 'days',
  calculate_overtime TINYINT(1) NOT NULL DEFAULT 0,
  shift_start_time TIME NOT NULL DEFAULT '09:00:00',
  shift_end_time TIME NOT NULL DEFAULT '17:00:00',
  overtime_multiplier DECIMAL(5,2) NOT NULL DEFAULT 1.50,
  updated_by_uuid CHAR(36) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS organization_monthly_work_schedules (
  id BIGINT NOT NULL AUTO_INCREMENT,
  organization_id INT NOT NULL,
  schedule_date DATE NOT NULL,
  day_type ENUM('working','off') NOT NULL,
  updated_by_uuid CHAR(36) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_schedule_date (organization_id, schedule_date),
  KEY idx_org_schedule_month (organization_id, schedule_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
