import type { Material, MaterialRequest, RequestStatus, StockItem } from "@/models/inventory";
import type { InventoryRepository } from "@/repositories/contracts";
import { getStore, upsert } from "./store";

export class MockInventoryRepository implements InventoryRepository {
  async listMaterials() {
    return structuredClone(getStore().materials);
  }
  async saveMaterial(material: Material) {
    return upsert(getStore().materials, material);
  }
  async listStock(projectId: string) {
    return structuredClone(getStore().stock.filter((s) => s.projectId === projectId));
  }
  async findStock(projectId: string, materialId: string) {
    const found = getStore().stock.find((s) => s.projectId === projectId && s.materialId === materialId);
    return found ? structuredClone(found) : null;
  }
  async saveStock(item: StockItem) {
    return upsert(getStore().stock, item);
  }
  async listRequests(filter?: { projectId?: string; status?: RequestStatus }) {
    return structuredClone(
      getStore()
        .requests.filter(
          (r) =>
            (!filter?.projectId || r.projectId === filter.projectId) &&
            (!filter?.status || r.status === filter.status),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }
  async findRequest(id: string) {
    const found = getStore().requests.find((r) => r.id === id);
    return found ? structuredClone(found) : null;
  }
  async saveRequest(request: MaterialRequest) {
    return upsert(getStore().requests, request);
  }
}
