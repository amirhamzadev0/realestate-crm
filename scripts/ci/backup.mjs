// JSON backup of every table, written before a deploy. Usage: node scripts/ci/backup.mjs <output-dir>
// Password hashes and session tokens are not included.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { connect } from "../lib/db.mjs";

const SKIP_COLUMNS = { users: ["password_hash"] };
const SKIP_TABLES = new Set(["sessions"]);

const outDir = process.argv[2] ?? path.join(process.cwd(), ".private", "backups");
const conn = await connect();
try {
  const [tables] = await conn.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'");
  const dump = {};
  for (const { name } of tables) {
    if (SKIP_TABLES.has(name)) continue;
    const [rows] = await conn.query(`SELECT * FROM \`${name}\``);
    const skip = SKIP_COLUMNS[name] ?? [];
    dump[name] = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !skip.includes(key))));
  }
  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(file, JSON.stringify(dump), { mode: 0o600 });
  console.log(`backup written: ${file}`);
} finally {
  await conn.end();
}
