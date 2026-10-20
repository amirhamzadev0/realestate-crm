ALTER TABLE workers
  ADD COLUMN joined_at DATE NOT NULL DEFAULT (CURRENT_DATE);

-- One row per salary or task payment the Super Admin has handed over. Anything due and not in here is pending.
CREATE TABLE IF NOT EXISTS payroll_payments (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  kind ENUM('salary','task') NOT NULL,
  ref VARCHAR(64) NOT NULL,                         -- salary: cycle number (1 = first month after joining); task: assignment id
  amount BIGINT NOT NULL,
  paid_at DATE NOT NULL,
  UNIQUE KEY uq_payroll_item (worker_id, kind, ref),
  KEY idx_payroll_project_date (project_id, paid_at),
  CONSTRAINT fk_payroll_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
