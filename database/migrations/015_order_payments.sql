-- An order records what it costs, who supplies it and how it is paid. Payments are debited from the project's accounts.
ALTER TABLE material_requests
  ADD COLUMN vendor VARCHAR(120) NULL,
  ADD COLUMN total_amount BIGINT NULL,
  ADD COLUMN payment_terms ENUM('advance','on-delivery') NULL,
  ADD COLUMN amount_paid BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN paid_at DATE NULL;
