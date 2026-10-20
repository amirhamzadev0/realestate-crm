import type { ChangeRequest } from "@/models/changes";
import type { ChangeRequestRepository } from "@/repositories/contracts";
import { getStore, upsert } from "./store";

export class MockChangeRequestRepository implements ChangeRequestRepository {
  async list(filter?: { projectId?: string; status?: ChangeRequest["status"]; kind?: ChangeRequest["kind"] }) {
    return structuredClone(
      getStore()
        .changeRequests.filter(
          (r) =>
            (!filter?.projectId || r.projectId === filter.projectId) &&
            (!filter?.status || r.status === filter.status) &&
            (!filter?.kind || r.kind === filter.kind),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }
  async find(id: string) {
    const found = getStore().changeRequests.find((r) => r.id === id);
    return found ? structuredClone(found) : null;
  }
  async save(request: ChangeRequest) {
    return upsert(getStore().changeRequests, request);
  }
}
