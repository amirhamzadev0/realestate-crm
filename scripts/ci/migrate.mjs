// Applies database/migrations/*.sql in order, once each. Applied files are checksum-tracked:
// editing one that already ran is refused. Add a new numbered file instead.
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connect } from "../lib/db.mjs";

const DIR = path.join(process.cwd(), "database", "migrations");
const LOCK = "buildflow_migrate";

export async function pendingMigrations(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [rows] = await conn.query("SELECT name, checksum FROM schema_migrations");
  const applied = new Map(rows.map((r) => [r.name, r.checksum]));
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();

  const pending = [];
  for (const file of files) {
    const sql = await readFile(path.join(DIR, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    if (!applied.has(file)) pending.push({ file, sql, checksum });
    else if (applied.get(file) !== checksum) {
      throw new Error(`Migration ${file} was changed after it was applied. Add a new migration instead.`);
    }
  }
  return pending;
}

export async function runMigrations(conn, { dryRun = false } = {}) {
  const [[lock]] = await conn.query("SELECT GET_LOCK(?, 60) AS got", [LOCK]);
  if (lock.got !== 1) throw new Error("Another migration is running; could not get the lock.");
  try {
    const pending = await pendingMigrations(conn);
    for (const { file, sql, checksum } of pending) {
      if (dryRun) {
        console.log(`would apply ${file}`);
        continue;
      }
      await conn.query(sql);
      await conn.query("INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)", [file, checksum]);
      console.log(`applied ${file}`);
    }
    if (!pending.length) console.log("migrations: up to date");
    return pending.length;
  } finally {
    await conn.query("SELECT RELEASE_LOCK(?)", [LOCK]);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const conn = await connect();
  try {
    await runMigrations(conn, { dryRun: process.argv.includes("--dry-run") });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}
