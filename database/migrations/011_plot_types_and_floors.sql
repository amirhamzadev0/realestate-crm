-- Each project sells its units in categories (commercial, residential, general), each with its own price.
CREATE TABLE IF NOT EXISTS project_rates (
  project_id VARCHAR(64) NOT NULL,
  category ENUM('commercial','residential','general') NOT NULL,
  rate BIGINT NOT NULL,                              -- PKR per sq ft (high-rise) or per marla (land plotting)
  PRIMARY KEY (project_id, category),
  CONSTRAINT fk_rates_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- How many units each floor of a high-rise has.
CREATE TABLE IF NOT EXISTS project_floors (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  floor VARCHAR(20) NOT NULL,
  units INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_floor (project_id, floor),
  CONSTRAINT fk_floors_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The single rate every project had becomes its "general" price.
INSERT IGNORE INTO project_rates (project_id, category, rate) SELECT id, 'general', sale_rate FROM projects WHERE sale_rate > 0;
ALTER TABLE projects DROP COLUMN sale_rate;

ALTER TABLE sales
  ADD COLUMN category ENUM('commercial','residential','general') NOT NULL DEFAULT 'general',
  ADD COLUMN buyer_phone VARCHAR(40) NULL,
  ADD COLUMN buyer_cnic VARCHAR(20) NULL,
  ADD COLUMN buyer_email VARCHAR(254) NULL;
