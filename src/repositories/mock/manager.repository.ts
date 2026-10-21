import type { Manager } from "@/models/manager";
import type { ManagerRepository } from "@/repositories/contracts";
import { getStore, upsert } from "./store";

export class MockManagerRepository implements ManagerRepository {
  async list() {
    return structuredClone([...getStore().managers].sort((a, b) => a.name.localeCompare(b.name)));
  }
  async find(id: string) {
    const found = getStore().managers.find((m) => m.id === id);
    return found ? structuredClone(found) : null;
  }
  async save(manager: Manager) {
    return upsert(getStore().managers, manager);
  }
}
