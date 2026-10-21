-- Every unit of a high-rise: plot type, floor, number and size. Replaces the per-floor unit counts.
CREATE TABLE IF NOT EXISTS project_units (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  category ENUM('commercial','residential','general') NOT NULL,
  floor VARCHAR(20) NOT NULL,
  unit VARCHAR(60) NOT NULL,
  area DECIMAL(12,2) NOT NULL,                      -- sq ft
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_project_unit (project_id, unit),
  KEY idx_units_category_floor (project_id, category, floor),
  CONSTRAINT fk_units_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS project_floors;

-- A direct sale may be discounted. price is what the buyer pays; list_price is area x rate before the discount.
ALTER TABLE sales
  ADD COLUMN list_price BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN discount_mode ENUM('amount','rate','percent') NULL,
  ADD COLUMN discount_value DECIMAL(16,2) NULL,
  ADD COLUMN discount_amount BIGINT NULL;
UPDATE sales SET list_price = price;
