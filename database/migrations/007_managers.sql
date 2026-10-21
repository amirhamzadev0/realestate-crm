CREATE TABLE IF NOT EXISTS managers (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  email VARCHAR(254) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A manager runs at most one project (UNIQUE allows many NULLs, so projects can be unassigned).
ALTER TABLE projects
  ADD COLUMN manager_id VARCHAR(64) NULL,
  ADD UNIQUE KEY uq_projects_manager (manager_id),
  ADD CONSTRAINT fk_projects_manager FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE SET NULL;

-- Existing projects keep the manager named in admin_name.
INSERT IGNORE INTO managers (id, name) SELECT CONCAT('mgr_', id), admin_name FROM projects;
UPDATE projects SET manager_id = CONCAT('mgr_', id) WHERE manager_id IS NULL;
