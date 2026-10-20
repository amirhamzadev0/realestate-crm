import { z } from "zod";
import type { Material, MaterialRequest, MaterialRequestView, RequestStatus, StockItem, StockView } from "@/models/inventory";
import type { InventoryRepository, ProjectRepository } from "@/repositories/contracts";
import { AppError, notFound } from "@/utils/errors";
import { newId, today } from "@/utils/id";

export const materialRequestSchema = z.object({
  projectId: z.string().min(1),
  materialId: z.string().min(1),
  quantity: z.number().positive().max(10_000_000),
  note: z.string().trim().max(500).default(""),
  requestedBy: z.string().trim().min(1).max(120),
});

export const decisionSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).default(""),
});

export const usageSchema = z.object({
  projectId: z.string().min(1),
  materialId: z.string().min(1),
  quantity: z.number().positive(),
});

export const warehouseReceiptSchema = z.object({
  materialId: z.string().min(1),
  quantity: z.number().positive().max(10_000_000),
});

export const newWarehouseItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(["structure", "finishing", "plumbing", "electrical"]),
  unit: z.string().trim().min(1).max(20),
  quantity: z.number().positive().max(10_000_000),
  minLevel: z.number().min(0).max(10_000_000).default(0),
});

export class InventoryService {
  constructor(
    private repo: InventoryRepository,
    private projects: ProjectRepository,
  ) {}

  listMaterials(): Promise<Material[]> {
    return this.repo.listMaterials();
  }

  private async toStockViews(items: StockItem[]): Promise<StockView[]> {
    const materials = new Map((await this.repo.listMaterials()).map((m) => [m.id, m]));
    return items.map((item) => ({
      ...item,
      materialName: materials.get(item.materialId)?.name ?? "Unknown",
      unit: materials.get(item.materialId)?.unit ?? "",
      low: item.quantity <= item.minLevel,
    }));
  }

  async projectStock(projectId: string): Promise<StockView[]> {
    return this.toStockViews(await this.repo.listStock("project", projectId));
  }

  async warehouseStock(): Promise<StockView[]> {
    return this.toStockViews(await this.repo.listStock("warehouse"));
  }

  async listRequests(filter?: { projectId?: string; status?: RequestStatus }): Promise<MaterialRequestView[]> {
    const [requests, materials, projects] = await Promise.all([
      this.repo.listRequests(filter),
      this.repo.listMaterials(),
      this.projects.list(),
    ]);
    const materialById = new Map(materials.map((m) => [m.id, m]));
    const projectById = new Map(projects.map((p) => [p.id, p]));
    return requests.map((r) => ({
      ...r,
      materialName: materialById.get(r.materialId)?.name ?? "Unknown",
      unit: materialById.get(r.materialId)?.unit ?? "",
      projectName: projectById.get(r.projectId)?.name ?? "Unknown",
    }));
  }

  /** Project admin asks the super admin for material. */
  async createRequest(input: unknown): Promise<MaterialRequest> {
    const data = materialRequestSchema.parse(input);
    if (!(await this.projects.findById(data.projectId))) throw notFound("Project");
    if (!(await this.repo.listMaterials()).some((m) => m.id === data.materialId)) throw notFound("Material");
    return this.repo.saveRequest({ ...data, id: newId("r"), createdAt: today(), status: "pending" });
  }

  /** Super admin approves or rejects a pending request. */
  async decide(input: unknown): Promise<MaterialRequest> {
    const data = decisionSchema.parse(input);
    const request = await this.repo.findRequest(data.requestId);
    if (!request) throw notFound("Request");
    if (request.status !== "pending") throw new AppError("Request was already decided", 409);
    const decided = await this.repo.saveRequest({
      ...request,
      status: data.decision,
      decisionNote: data.note,
      decidedAt: today(),
    });
    if (data.decision === "rejected") return decided;

    // Approval hands the material over straight away when the warehouse has it.
    // Otherwise it stays "approved" and the warehouse issues it once restocked.
    const source = await this.repo.findStock("warehouse", null, request.materialId);
    return source && source.quantity >= request.quantity ? this.fulfill(request.id) : decided;
  }

  /** Warehouse moves stock of an approved request to the project. */
  async fulfill(requestId: string): Promise<MaterialRequest> {
    const request = await this.repo.findRequest(requestId);
    if (!request) throw notFound("Request");
    if (request.status !== "approved") throw new AppError("Only approved requests can be issued", 409);

    const source = await this.repo.findStock("warehouse", null, request.materialId);
    if (!source || source.quantity < request.quantity) throw new AppError("Not enough stock in the warehouse", 409);
    const target = (await this.repo.findStock("project", request.projectId, request.materialId)) ?? {
      id: newId("s"),
      scope: "project" as const,
      projectId: request.projectId,
      materialId: request.materialId,
      quantity: 0,
      used: 0,
      minLevel: 0,
    };

    await this.repo.saveStock({ ...source, quantity: source.quantity - request.quantity });
    await this.repo.saveStock({ ...target, quantity: target.quantity + request.quantity });
    return this.repo.saveRequest({ ...request, status: "fulfilled" });
  }

  /** Material consumed on site. */
  async recordUsage(input: unknown): Promise<StockItem> {
    const data = usageSchema.parse(input);
    const stock = await this.repo.findStock("project", data.projectId, data.materialId);
    if (!stock) throw notFound("Stock item");
    if (stock.quantity < data.quantity) throw new AppError("Not enough stock on site", 409);
    return this.repo.saveStock({ ...stock, quantity: stock.quantity - data.quantity, used: stock.used + data.quantity });
  }

  /** A brand-new material (not yet in the catalogue) goes straight into the warehouse. */
  async addNewItemToWarehouse(input: unknown): Promise<StockItem> {
    const data = newWarehouseItemSchema.parse(input);
    const materials = await this.repo.listMaterials();
    const existing = materials.find((m) => m.name.toLowerCase() === data.name.toLowerCase());
    const material =
      existing ??
      (await this.repo.saveMaterial({ id: newId("m"), name: data.name, category: data.category, unit: data.unit }));
    const stock = await this.repo.findStock("warehouse", null, material.id);
    return this.repo.saveStock({
      id: stock?.id ?? newId("s"),
      scope: "warehouse",
      projectId: null,
      materialId: material.id,
      quantity: (stock?.quantity ?? 0) + data.quantity,
      used: stock?.used ?? 0,
      minLevel: data.minLevel || stock?.minLevel || 0,
    });
  }

  /** Purchased material arriving at the central warehouse. */
  async receiveIntoWarehouse(input: unknown): Promise<StockItem> {
    const data = warehouseReceiptSchema.parse(input);
    if (!(await this.repo.listMaterials()).some((m) => m.id === data.materialId)) throw notFound("Material");
    const stock = (await this.repo.findStock("warehouse", null, data.materialId)) ?? {
      id: newId("s"),
      scope: "warehouse" as const,
      projectId: null,
      materialId: data.materialId,
      quantity: 0,
      used: 0,
      minLevel: 0,
    };
    return this.repo.saveStock({ ...stock, quantity: stock.quantity + data.quantity });
  }
}
