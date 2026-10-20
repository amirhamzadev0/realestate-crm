// Creates the sign-in accounts: one Super Admin, Warehouse, Sales, and a Project Admin per project.
// Writes .private/users.json (password hashes, read by the app and by db:setup) and
// .private/access.txt (plaintext passwords, shown once). Nothing is printed to the terminal.
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashPassword, randomPassword } from "./lib/password.mjs";

const PRIVATE = path.join(process.cwd(), ".private");
const USERS_FILE = path.join(PRIVATE, "users.json");
const ACCESS_FILE = path.join(PRIVATE, "access.txt");
const DOMAIN = process.env.LOGIN_EMAIL_DOMAIN ?? "buildflow.local";

const force = process.argv.includes("--force");
try {
  await readFile(USERS_FILE);
  if (!force) {
    console.error(".private/users.json already exists. Run with --force to replace every account and password.");
    process.exit(1);
  }
} catch {
  // no file yet
}

const projects = JSON.parse(await readFile(path.join(process.cwd(), "src", "data", "mock", "projects.json"), "utf8"));
const accounts = [
  { id: "u_superadmin", email: `owner@${DOMAIN}`, name: "Owner", role: "superadmin", projectId: null },
  { id: "u_warehouse", email: `warehouse@${DOMAIN}`, name: "Warehouse Keeper", role: "warehouse", projectId: null },
  { id: "u_sales", email: `sales@${DOMAIN}`, name: "Sales Manager", role: "sales", projectId: null },
  ...projects.map((p) => ({
    id: `u_${p.id}`,
    email: `${p.slug}@${DOMAIN}`,
    name: p.adminName,
    role: "project-admin",
    projectId: p.id,
  })),
];

const users = [];
const lines = ["BuildFlow CRM sign-in accounts (delete this file after you have saved the passwords)", ""];
for (const account of accounts) {
  const password = randomPassword();
  users.push({ ...account, passwordHash: hashPassword(password), enabled: true });
  lines.push(`${account.role.padEnd(14)} ${account.email.padEnd(36)} ${password}`);
}

await mkdir(PRIVATE, { recursive: true });
await writeFile(USERS_FILE, `${JSON.stringify(users, null, 2)}\n`, { mode: 0o600 });
await writeFile(ACCESS_FILE, `${lines.join("\n")}\n`, { mode: 0o600 });
await chmod(USERS_FILE, 0o600).catch(() => {});
await chmod(ACCESS_FILE, 0o600).catch(() => {});
console.log(`Created ${users.length} accounts. Passwords are in .private/access.txt`);
