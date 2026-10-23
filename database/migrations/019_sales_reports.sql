-- Saved monthly sales reports: one per month, kept so the history of each agent's progress is never lost.
CREATE TABLE IF NOT EXISTS sales_reports (
  period CHAR(7) NOT NULL PRIMARY KEY,               -- "2026-10"
  is_final TINYINT(1) NOT NULL DEFAULT 0,            -- 0 while the month is still running
  generated_at DATETIME(3) NOT NULL,                 -- UTC
  payload JSON NOT NULL                              -- the report rows
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
