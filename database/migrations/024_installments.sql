-- Selling on instalments: a sale is "booked" until every instalment is paid, then "sold". The Finance department follows the instalments up.
ALTER TABLE sales
  ADD COLUMN payment_type ENUM('cash','installment') NOT NULL DEFAULT 'cash',
  ADD COLUMN sale_status ENUM('booked','sold') NOT NULL DEFAULT 'sold';

CREATE TABLE IF NOT EXISTS installments (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  sale_id VARCHAR(64) NOT NULL,
  project_id VARCHAR(64) NOT NULL,
  seq INT NOT NULL,
  kind ENUM('booking','monthly','balloon','possession') NOT NULL,
  amount BIGINT NOT NULL,
  due_date DATE NULL,                 -- NULL: due on possession
  paid BIGINT NOT NULL DEFAULT 0,
  paid_at DATE NULL,                  -- the day of the latest payment
  follow_up_on DATE NULL,             -- when to follow this instalment up again (for example the buyer asked for 5 more days)
  contacts JSON NULL,                 -- every call / message / note, oldest first
  KEY idx_installments_sale (sale_id),
  KEY idx_installments_due (due_date),
  CONSTRAINT fk_installments_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  CONSTRAINT fk_installments_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users MODIFY COLUMN role ENUM('superadmin','project-admin','warehouse','sales','agent','finance') NOT NULL;
