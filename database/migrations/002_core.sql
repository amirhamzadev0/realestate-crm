CREATE TABLE IF NOT EXISTS projects (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  slug VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  location VARCHAR(200) NOT NULL,
  status ENUM('planning','under-construction','completed') NOT NULL DEFAULT 'planning',
  start_date DATE NOT NULL,
  total_units INT NOT NULL DEFAULT 0,
  budget BIGINT NOT NULL DEFAULT 0,                 -- whole PKR
  admin_name VARCHAR(120) NOT NULL,
  image VARCHAR(255) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- users.project_id (001) is a plain column until projects exists; the migration runner
-- applies each file once, so this ALTER is not repeated.
ALTER TABLE users
  ADD CONSTRAINT fk_users_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS account_entries (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  entry_date DATE NOT NULL,
  type ENUM('debit','credit','expense','sale','purchase') NOT NULL,
  amount BIGINT NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  party VARCHAR(200) NOT NULL DEFAULT '',
  inserted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_account_project_date (project_id, entry_date),
  CONSTRAINT fk_account_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS materials (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  category ENUM('structure','finishing','plumbing','electrical') NOT NULL,
  unit VARCHAR(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_items (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  scope ENUM('project','warehouse') NOT NULL,
  project_id VARCHAR(64) NULL,                      -- NULL for the warehouse
  project_key VARCHAR(64) GENERATED ALWAYS AS (IFNULL(project_id, '')) STORED,
  material_id VARCHAR(64) NOT NULL,
  quantity DECIMAL(14,2) NOT NULL DEFAULT 0,
  used DECIMAL(14,2) NOT NULL DEFAULT 0,
  min_level DECIMAL(14,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_stock_location (scope, project_key, material_id),
  CONSTRAINT chk_stock_quantity CHECK (quantity >= 0),
  CONSTRAINT fk_stock_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS material_requests (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  material_id VARCHAR(64) NOT NULL,
  quantity DECIMAL(14,2) NOT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  requested_by VARCHAR(120) NOT NULL,
  created_at DATE NOT NULL,
  status ENUM('pending','approved','rejected','fulfilled') NOT NULL DEFAULT 'pending',
  decision_note VARCHAR(500) NULL,
  decided_at DATE NULL,
  inserted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_requests_project (project_id, status),
  KEY idx_requests_status (status, created_at),
  CONSTRAINT fk_requests_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_requests_material FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workers (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  name VARCHAR(120) NOT NULL,
  type ENUM('employee','labour') NOT NULL,
  role VARCHAR(80) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  monthly_salary BIGINT NOT NULL DEFAULT 0,
  daily_wage BIGINT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  KEY idx_workers_project (project_id),
  CONSTRAINT fk_workers_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  worker_id VARCHAR(64) NOT NULL,
  att_date DATE NOT NULL,
  status ENUM('present','absent','half-day') NOT NULL,
  KEY idx_attendance_worker_date (worker_id, att_date),
  CONSTRAINT fk_attendance_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assignments (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  worker_id VARCHAR(64) NOT NULL,
  task VARCHAR(300) NOT NULL,
  status ENUM('todo','in-progress','done') NOT NULL DEFAULT 'todo',
  due_date DATE NOT NULL,
  KEY idx_assignments_project (project_id),
  CONSTRAINT fk_assignments_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assignments_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  commission_rate DECIMAL(5,2) NOT NULL DEFAULT 0,  -- percent of sale price
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  platform ENUM('facebook','instagram') NOT NULL,
  project_id VARCHAR(64) NOT NULL,
  budget BIGINT NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_campaigns_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leads (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  project_id VARCHAR(64) NOT NULL,
  source ENUM('facebook','instagram','walk-in','referral','website') NOT NULL,
  campaign_id VARCHAR(64) NULL,
  agent_id VARCHAR(64) NULL,
  status ENUM('new','contacted','site-visit','negotiation','won','lost') NOT NULL DEFAULT 'new',
  created_at DATE NOT NULL,
  inserted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_leads_project_status (project_id, status),
  CONSTRAINT fk_leads_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_leads_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  project_id VARCHAR(64) NOT NULL,
  agent_id VARCHAR(64) NOT NULL,
  lead_id VARCHAR(64) NULL,
  unit VARCHAR(60) NOT NULL,
  price BIGINT NOT NULL,
  sale_date DATE NOT NULL,
  inserted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_sales_project (project_id),
  CONSTRAINT fk_sales_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS change_requests (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  kind ENUM('worker','agent') NOT NULL,
  action ENUM('add','edit','remove') NOT NULL,
  project_id VARCHAR(64) NULL,
  target_id VARCHAR(64) NULL,
  target_name VARCHAR(120) NOT NULL DEFAULT '',
  payload JSON NULL,
  requested_by VARCHAR(120) NOT NULL,
  created_at DATE NOT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  decision_note VARCHAR(500) NULL,
  decided_at DATE NULL,
  inserted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_changes_status (status, kind),
  CONSTRAINT fk_changes_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
