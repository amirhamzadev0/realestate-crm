import type { Installment } from "@/models/finance";
import type { FinanceRepository } from "@/repositories/contracts";
import { getStore, upsert } from "./store";

export class MockFinanceRepository implements FinanceRepository {
  async list(filter?: { saleId?: string; projectId?: string }) {
    return structuredClone(
      getStore()
        .installments.filter((i) => (!filter?.saleId || i.saleId === filter.saleId) && (!filter?.projectId || i.projectId === filter.projectId))
        .sort((a, b) => a.saleId.localeCompare(b.saleId) || a.seq - b.seq),
    );
  }
  async find(id: string) {
    const found = getStore().installments.find((i) => i.id === id);
    return found ? structuredClone(found) : null;
  }
  async saveAll(items: Installment[]) {
    return items.map((item) => upsert(getStore().installments, item));
  }
  async removeAll(ids: string[]) {
    const store = getStore();
    store.installments = store.installments.filter((i) => !ids.includes(i.id));
  }
}
