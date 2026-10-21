import "server-only";

import type { Manager } from "@/models/manager";
import type { ManagerRepository } from "@/repositories/contracts";
import { run, select, selectOne, type Row } from "./db";

const decode = (row: Row): Manager => ({ ...(row as unknown as Manager), active: Boolean(row.active) });

export class MysqlManagerRepository implements ManagerRepository {
  async list() {
    return (await select("SELECT id, name, phone, email, active FROM managers ORDER BY name")).map(decode);
  }
  async find(id: string) {
    const row = await selectOne("SELECT id, name, phone, email, active FROM managers WHERE id = ?", [id]);
    return row ? decode(row) : null;
  }
  async save(manager: Manager) {
    await run(
      `INSERT INTO managers (id, name, phone, email, active) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), email = VALUES(email), active = VALUES(active)`,
      [manager.id, manager.name, manager.phone, manager.email, manager.active ? 1 : 0],
    );
    return manager;
  }
}
