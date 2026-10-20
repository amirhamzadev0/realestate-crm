import "server-only";

import type { AccountEntry } from "@/models/accounts";
import type { AccountRepository } from "@/repositories/contracts";
import { run, select, type Row } from "./db";

const decode = (row: Row) => row as unknown as AccountEntry;

export class MysqlAccountRepository implements AccountRepository {
  async listByProject(projectId: string) {
    const rows = await select(
      `SELECT id, project_id AS projectId, entry_date AS date, type, amount, description, party
       FROM account_entries WHERE project_id = ? ORDER BY entry_date DESC, inserted_at DESC`,
      [projectId],
    );
    return rows.map(decode);
  }
  async add(entry: AccountEntry) {
    await run(
      `INSERT INTO account_entries (id, project_id, entry_date, type, amount, description, party)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE entry_date = VALUES(entry_date), type = VALUES(type), amount = VALUES(amount),
         description = VALUES(description), party = VALUES(party)`,
      [entry.id, entry.projectId, entry.date, entry.type, entry.amount, entry.description, entry.party],
    );
    return entry;
  }
}
