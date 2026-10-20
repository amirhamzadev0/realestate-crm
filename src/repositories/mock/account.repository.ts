import type { AccountEntry } from "@/models/accounts";
import type { AccountRepository } from "@/repositories/contracts";
import { getStore, upsert } from "./store";

export class MockAccountRepository implements AccountRepository {
  async listByProject(projectId: string) {
    return structuredClone(
      getStore()
        .accounts.filter((e) => e.projectId === projectId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    );
  }
  async add(entry: AccountEntry) {
    return upsert(getStore().accounts, entry);
  }
}
