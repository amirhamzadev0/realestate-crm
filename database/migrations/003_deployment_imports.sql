CREATE TABLE IF NOT EXISTS deployment_imports (
  id VARCHAR(64) NOT NULL PRIMARY KEY,              -- e.g. "initial-data"
  checksum CHAR(64) NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
