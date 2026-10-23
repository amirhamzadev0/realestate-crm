-- The sales department has a manager (who creates agents and can sell himself) and agents (who see their own portal).
CREATE TABLE IF NOT EXISTS sales_managers (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NOT NULL DEFAULT '',
  email VARCHAR(254) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE agents
  ADD COLUMN manager_id VARCHAR(64) NULL,
  ADD CONSTRAINT fk_agents_manager FOREIGN KEY (manager_id) REFERENCES sales_managers(id) ON DELETE SET NULL;

ALTER TABLE sales
  ADD COLUMN sold_by_manager_id VARCHAR(64) NULL,
  ADD CONSTRAINT fk_sales_sold_by_manager FOREIGN KEY (sold_by_manager_id) REFERENCES sales_managers(id) ON DELETE SET NULL;

ALTER TABLE users
  MODIFY COLUMN role ENUM('superadmin','project-admin','warehouse','sales','agent') NOT NULL,
  ADD COLUMN agent_id VARCHAR(64) NULL,
  ADD CONSTRAINT fk_users_agent FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;
