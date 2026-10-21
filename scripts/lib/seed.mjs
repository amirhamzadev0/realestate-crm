// Copies the Phase 1 mock JSON (src/data/mock) into MySQL. Inserts missing rows only and never
// overwrites rows that were edited since, so it is safe to run again.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const MOCK = path.join(process.cwd(), "src", "data", "mock");

// table, json file, then [column, key in the JSON record]. Order matters: parents before children.
const TABLES = [
  ["managers", "managers.json", [["id", "id"], ["name", "name"], ["phone", "phone"], ["email", "email"], ["active", "active"]]],
  ["projects", "projects.json", [["id", "id"], ["slug", "slug"], ["name", "name"], ["location", "location"], ["status", "status"], ["start_date", "startDate"], ["total_units", "totalUnits"], ["budget", "budget"], ["manager_id", "managerId"], ["admin_name", "adminName"], ["image", "image"], ["sort_order", "order"]]],
  ["materials", "materials.json", [["id", "id"], ["name", "name"], ["category", "category"], ["unit", "unit"]]],
  ["agents", "agents.json", [["id", "id"], ["name", "name"], ["phone", "phone"], ["commission_rate", "commissionRate"], ["active", "active"]]],
  ["campaigns", "campaigns.json", [["id", "id"], ["name", "name"], ["platform", "platform"], ["project_id", "projectId"], ["budget", "budget"], ["start_date", "startDate"], ["active", "active"]]],
  ["workers", "workers.json", [["id", "id"], ["project_id", "projectId"], ["name", "name"], ["type", "type"], ["role", "role"], ["phone", "phone"], ["monthly_salary", "monthlySalary"], ["daily_wage", "dailyWage"], ["active", "active"], ["joined_at", "joinedAt"]]],
  ["payroll_payments", "payments.json", [["id", "id"], ["project_id", "projectId"], ["worker_id", "workerId"], ["kind", "kind"], ["ref", "ref"], ["amount", "amount"], ["paid_at", "paidAt"]]],
  ["stock_items", "stock.json", [["id", "id"], ["scope", "scope"], ["project_id", "projectId"], ["material_id", "materialId"], ["quantity", "quantity"], ["used", "used"], ["min_level", "minLevel"]]],
  ["account_entries", "accounts.json", [["id", "id"], ["project_id", "projectId"], ["entry_date", "date"], ["type", "type"], ["amount", "amount"], ["description", "description"], ["party", "party"]]],
  ["material_requests", "material-requests.json", [["id", "id"], ["project_id", "projectId"], ["material_id", "materialId"], ["quantity", "quantity"], ["note", "note"], ["requested_by", "requestedBy"], ["created_at", "createdAt"], ["status", "status"], ["decision_note", "decisionNote"], ["decided_at", "decidedAt"]]],
  ["leads", "leads.json", [["id", "id"], ["name", "name"], ["phone", "phone"], ["project_id", "projectId"], ["source", "source"], ["campaign_id", "campaignId"], ["agent_id", "agentId"], ["status", "status"], ["created_at", "createdAt"]]],
  ["sales", "sales.json", [["id", "id"], ["project_id", "projectId"], ["agent_id", "agentId"], ["lead_id", "leadId"], ["unit", "unit"], ["price", "price"], ["sale_date", "date"]]],
  ["assignments", "assignments.json", [["id", "id"], ["project_id", "projectId"], ["worker_id", "workerId"], ["task", "task"], ["status", "status"], ["assigned_at", "assignedAt"], ["due_date", "dueDate"], ["payment", "payment"], ["completed_at", "completedAt"]]],
  ["attendance", "attendance.json", [["id", "id"], ["worker_id", "workerId"], ["att_date", "date"], ["status", "status"]]],
  ["change_requests", "change-requests.json", [["id", "id"], ["kind", "kind"], ["action", "action"], ["project_id", "projectId"], ["target_id", "targetId"], ["target_name", "targetName"], ["payload", "payload"], ["requested_by", "requestedBy"], ["created_at", "createdAt"], ["status", "status"], ["decision_note", "decisionNote"], ["decided_at", "decidedAt"]]],
];

function toParam(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

export async function seedData(conn) {
  const hash = createHash("sha256");
  let inserted = 0;
  for (const [table, file, columns] of TABLES) {
    const raw = await readFile(path.join(MOCK, file), "utf8");
    hash.update(raw);
    const records = JSON.parse(raw);
    const names = columns.map(([column]) => `\`${column}\``).join(", ");
    const marks = columns.map(() => "?").join(", ");
    for (const record of records) {
      const [result] = await conn.execute(
        `INSERT IGNORE INTO \`${table}\` (${names}) VALUES (${marks})`,
        columns.map(([, key]) => toParam(record[key])),
      );
      inserted += result.affectedRows;
    }
  }
  await conn.execute(
    "INSERT INTO deployment_imports (id, checksum) VALUES ('initial-data', ?) ON DUPLICATE KEY UPDATE checksum = VALUES(checksum)",
    [hash.digest("hex")],
  );
  console.log(`seed: ${inserted} new rows`);
}
