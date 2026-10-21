ALTER TABLE projects
  ADD COLUMN project_type ENUM('high-rise','land-plotting') NOT NULL DEFAULT 'high-rise',
  ADD COLUMN sale_rate BIGINT NOT NULL DEFAULT 0;           -- PKR per sq ft (high-rise) or per marla (land plotting)

ALTER TABLE sales
  ADD COLUMN floor VARCHAR(20) NULL,
  ADD COLUMN area DECIMAL(12,2) NOT NULL DEFAULT 0,         -- sq ft or marla, as the project type says
  ADD COLUMN rate BIGINT NOT NULL DEFAULT 0;                -- the rate used for this sale

-- One sale per unit in a project (floor is not part of the key: unit numbers are unique inside a project).
ALTER TABLE sales ADD UNIQUE KEY uq_sales_unit (project_id, unit);
