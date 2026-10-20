CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,             -- "scrypt:<salt hex>:<key hex>"
  role ENUM('superadmin','project-admin','warehouse','sales') NOT NULL,
  project_id VARCHAR(64) NULL,                     -- set for project-admin only (FK added in 002)
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,         -- SHA-256 of the cookie token
  user_id VARCHAR(64) NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,              -- epoch ms
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
