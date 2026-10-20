// Local database setup: create the database, apply migrations, import the demo data, upsert the users.
//   npm run db:prepare   shows which migrations are pending, changes nothing
//   npm run db:setup     does everything (safe to repeat)
import { readFile } from "node:fs/promises";
import path from "node:path";
import { connect, connectCreatingDatabase } from "./lib/db.mjs";
import { runMigrations } from "./ci/migrate.mjs";
import { seedData } from "./lib/seed.mjs";

const apply = process.argv.includes("--apply");

async function upsertUsers(conn) {
  let users;
  try {
    users = JSON.parse(await readFile(path.join(process.cwd(), ".private", "users.json"), "utf8"));
  } catch {
    console.log("users: .private/users.json not found. Run npm run users:setup, then npm run db:setup again.");
    return;
  }
  for (const u of users) {
    await conn.execute(
      `INSERT INTO users (id, email, name, password_hash, role, project_id, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), password_hash = VALUES(password_hash),
         role = VALUES(role), project_id = VALUES(project_id), enabled = VALUES(enabled)`,
      [u.id, u.email.toLowerCase(), u.name, u.passwordHash, u.role, u.projectId, u.enabled ? 1 : 0],
    );
  }
  console.log(`users: ${users.length} accounts saved`);
}

const conn = apply ? await connectCreatingDatabase() : await connect();
try {
  if (!apply) {
    await runMigrations(conn, { dryRun: true });
    console.log("Dry run only. Use npm run db:setup to apply.");
  } else {
    await runMigrations(conn);
    await seedData(conn);
    await upsertUsers(conn);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
