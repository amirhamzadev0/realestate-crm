// Fails when a table or column the app queries is missing after migrations.
import { connect } from "../lib/db.mjs";

const EXPECTED = {
  users: ["id", "email", "name", "password_hash", "role", "project_id", "enabled"],
  sessions: ["token_hash", "user_id", "expires_at"],
  projects: ["id", "slug", "name", "location", "status", "start_date", "total_units", "budget", "project_type", "manager_id", "admin_name", "image", "sort_order"],
  project_rates: ["project_id", "category", "rate", "units"],
  project_units: ["id", "project_id", "category", "floor", "unit", "area", "sort_order"],
  managers: ["id", "name", "phone", "email", "active"],
  account_entries: ["id", "project_id", "entry_date", "type", "amount", "description", "party"],
  materials: ["id", "name", "category", "unit"],
  stock_items: ["id", "scope", "project_id", "project_key", "material_id", "quantity", "used", "min_level"],
  material_requests: ["id", "project_id", "material_id", "quantity", "note", "requested_by", "created_at", "status", "decision_note", "decided_at"],
  workers: ["id", "project_id", "name", "type", "role", "phone", "monthly_salary", "daily_wage", "active", "joined_at"],
  payroll_payments: ["id", "project_id", "worker_id", "kind", "ref", "amount", "paid_at"],
  attendance: ["id", "worker_id", "att_date", "status"],
  assignments: ["id", "project_id", "worker_id", "task", "status", "assigned_at", "due_date", "payment", "completed_at"],
  agents: ["id", "name", "phone", "commission_rate", "active"],
  campaigns: ["id", "name", "platform", "project_id", "budget", "start_date", "active"],
  leads: ["id", "name", "phone", "project_id", "source", "campaign_id", "agent_id", "status", "created_at"],
  sales: ["id", "project_id", "agent_id", "lead_id", "unit", "category", "buyer", "buyer_phone", "buyer_cnic", "buyer_email", "floor", "area", "rate", "list_price", "discount_mode", "discount_value", "discount_amount", "price", "sale_date"],
  change_requests: ["id", "kind", "action", "project_id", "target_id", "target_name", "payload", "requested_by", "created_at", "status", "decision_note", "decided_at"],
  deployment_imports: ["id", "checksum", "imported_at"],
};

const conn = await connect();
const problems = [];
try {
  const [rows] = await conn.query(
    "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()",
  );
  const have = new Map();
  for (const { t, c } of rows) have.set(t, [...(have.get(t) ?? []), c]);
  for (const [table, columns] of Object.entries(EXPECTED)) {
    const found = have.get(table);
    if (!found) problems.push(`missing table ${table}`);
    else for (const column of columns) if (!found.includes(column)) problems.push(`missing column ${table}.${column}`);
  }
} finally {
  await conn.end();
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`schema ok (${Object.keys(EXPECTED).length} tables)`);
