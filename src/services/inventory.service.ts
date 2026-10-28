import { z } from "zod";
import type { Delivery, Material, OrderPayment, MaterialRequest, MaterialRequestView, RequestStatus, StockItem, StockView } from "@/models/inventory";
import type { AccountRepository, InventoryRepository, ProjectRepository } from "@/repositories/contracts";
import { AppError, notFound } from "@/utils/errors";
import { newId, today } from "@/utils/id";
import { withLock } from "@/utils/lock";

export const materialRequestSchema = z.object({
  projectId: z.string().min(1),
  materialId: z.string().min(1),
  quantity: z.number().positive().max(10_000_000),
  note: z.string().trim().max(500).default(""),
  requestedBy: z.string().trim().min(1).max(120),
});

/**
 * What the Super Admin fills in when an order is placed: who supplies it, what it costs, the day it was ordered and
 * how it is paid. With an advance, that part is paid now and debited from the project; the rest is paid after delivery.
 */
const orderDetailsSchema = z
  .object({
    vendor: z.string().trim().min(1, "Enter the vendor").max(120),
    totalAmount: z.number().positive("Enter the amount of the order").max(Number.MAX_SAFE_INTEGER),
    orderDate: z.iso.date().optional(),
    paymentTerms: z.enum(["advance", "on-delivery"]).default("on-delivery"),
    advanceAmount: z.number().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .superRefine((order, ctx) => {
    if (order.orderDate && order.orderDate > today()) ctx.addIssue({ code: "custom", path: ["orderDate"], message: "The order date cannot be in the future" });
    if (order.paymentTerms === "advance") {
      if (order.advanceAmount === undefined) ctx.addIssue({ code: "custom", path: ["advanceAmount"], message: "Enter the advance amount" });
      else if (order.advanceAmount > order.totalAmount) {
        ctx.addIssue({ code: "custom", path: ["advanceAmount"], message: "The advance cannot be more than the order amount" });
      }
    }
  });
type OrderDetails = z.output<typeof orderDetailsSchema>;

export const decisionSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).default(""),
});

/** The Super Admin orders material for a project without waiting for a request. */
export const directOrderSchema = z.object({
  projectId: z.string().min(1),
  materialId: z.string().min(1),
  quantity: z.number().positive().max(10_000_000),
  note: z.string().trim().max(500).default(""),
});

export const payOrderSchema = z.object({
  requestId: z.string().min(1),
  amount: z.number().positive().max(Number.MAX_SAFE_INTEGER).optional(), // defaults to the whole balance
});

export const usageSchema = z.object({
  projectId: z.string().min(1),
  materialId: z.string().min(1),
  quantity: z.number().positive(),
});

export const newMaterialSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.enum(["structure", "finishing", "plumbing", "electrical"]),
  unit: z.string().trim().min(1).max(20),
});

export const receiveSchema = z.object({
  requestId: z.string().min(1),
  quantity: z.number().positive().max(10_000_000).optional(), // defaults to everything still to come
});

/** How much of an order has arrived. Orders closed before deliveries were recorded count as fully received. */
function receivedOf(request: MaterialRequest): { receivedQuantity: number; remainingQuantity: number } {
  const received = request.deliveries
    ? request.deliveries.reduce((sum, d) => sum + d.quantity, 0)
    : request.status === "fulfilled"
      ? request.quantity
      : 0;
  return { receivedQuantity: received, remainingQuantity: Math.max(0, request.quantity - received) };
}

/**
 * Material has no central stock. A project manager asks the Super Admin; approving the request places the order, or the
 * Super Admin orders directly. When the material arrives it is marked received and goes into the project's inventory.
 */
export class InventoryService {
  constructor(
    private repo: InventoryRepository,
    private projects: ProjectRepository,
    private accounts: AccountRepository,
  ) {}

  listMaterials(): Promise<Material[]> {
    return this.repo.listMaterials();
  }

  /** Adds a material to the list that can be requested and ordered. A name that exists already is refused. */
  async addMaterial(input: unknown): Promise<Material> {
    const data = newMaterialSchema.parse(input);
    const existing = (await this.repo.listMaterials()).find((m) => m.name.toLowerCase() === data.name.toLowerCase());
    if (existing) throw new AppError(`${existing.name} is already in the material list`, 409);
    return this.repo.saveMaterial({ ...data, id: newId("m") });
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
    return this.toStockViews(await this.repo.listStock(projectId));
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
      ...receivedOf(r),
      balanceDue: Math.max(0, (r.totalAmount ?? 0) - (r.amountPaid ?? 0)),
    }));
  }

  async getRequest(id: string): Promise<MaterialRequest> {
    const request = await this.repo.findRequest(id);
    if (!request) throw notFound("Request");
    return request;
  }

  /** Project manager asks the Super Admin for material. */
  async createRequest(input: unknown): Promise<MaterialRequest> {
    const data = materialRequestSchema.parse(input);
    if (!(await this.projects.findById(data.projectId))) throw notFound("Project");
    if (!(await this.repo.listMaterials()).some((m) => m.id === data.materialId)) throw notFound("Material");
    return this.repo.saveRequest({ ...data, id: newId("r"), createdAt: today(), status: "pending" });
  }

  /**
   * Places the order: records the vendor, amount and payment terms, and debits any advance from the project's accounts.
   * Returns the order fields to save on the request.
   */
  private async placeOrder(request: MaterialRequest, details: OrderDetails): Promise<Pick<MaterialRequest, "status" | "orderedAt" | "vendor" | "totalAmount" | "paymentTerms" | "amountPaid" | "payments">> {
    const orderedAt = details.orderDate ?? today();
    const advance = details.paymentTerms === "advance" ? (details.advanceAmount ?? 0) : 0;
    if (advance > 0) {
      await this.debit(request, advance, orderedAt, `Advance for ${await this.materialName(request)} order`, details.vendor);
    }
    return {
      status: "ordered",
      orderedAt,
      vendor: details.vendor,
      totalAmount: details.totalAmount,
      paymentTerms: details.paymentTerms,
      amountPaid: advance,
      payments: advance > 0 ? [{ date: orderedAt, amount: advance }] : [],
    };
  }

  private async materialName(request: MaterialRequest): Promise<string> {
    return (await this.repo.listMaterials()).find((m) => m.id === request.materialId)?.name ?? "material";
  }

  /** A payment to a vendor is a debit in the project's accounts: it reduces the project's balance. */
  private async debit(request: MaterialRequest, amount: number, date: string, description: string, vendor: string): Promise<void> {
    await this.accounts.add({
      id: newId("ac"),
      projectId: request.projectId,
      date,
      type: "debit",
      amount,
      description: `${description} (${request.quantity} units)`,
      party: vendor,
    });
  }

  /** Super Admin rejects a pending request, or approves it, which places the order with its vendor, amount and payment terms. */
  async decide(input: unknown): Promise<MaterialRequest> {
    const data = decisionSchema.parse(input);
    return withLock(`order:${data.requestId}`, () => this.decideNow(data, input));
  }

  private async decideNow(data: z.output<typeof decisionSchema>, input: unknown): Promise<MaterialRequest> {
    const request = await this.getRequest(data.requestId);
    if (request.status !== "pending") throw new AppError("Request was already decided", 409);
    const now = today();
    if (data.decision === "rejected") {
      return this.repo.saveRequest({ ...request, status: "rejected", decisionNote: data.note, decidedAt: now });
    }
    const order = await this.placeOrder(request, orderDetailsSchema.parse(input));
    return this.repo.saveRequest({ ...request, ...order, decisionNote: data.note || "Approved, material ordered", decidedAt: now });
  }

  /** Super Admin orders material for a project on their own. It is recorded as an order so it shows in the project's requests. */
  async orderDirect(input: unknown): Promise<MaterialRequest> {
    const data = directOrderSchema.parse(input);
    const details = orderDetailsSchema.parse(input);
    if (!(await this.projects.findById(data.projectId))) throw notFound("Project");
    if (!(await this.repo.listMaterials()).some((m) => m.id === data.materialId)) throw notFound("Material");
    const now = today();
    const request: MaterialRequest = {
      id: newId("r"),
      projectId: data.projectId,
      materialId: data.materialId,
      quantity: data.quantity,
      note: data.note,
      requestedBy: "Super Admin (ordered directly)",
      createdAt: now,
      status: "pending",
    };
    const order = await this.placeOrder(request, details);
    return this.repo.saveRequest({ ...request, ...order, decisionNote: "Ordered by the Super Admin", decidedAt: now });
  }

  /**
   * Some or all of the ordered material has arrived: it goes into the project's inventory. `quantity` is what arrived
   * this time (default: everything still to come). The order stays "ordered" until the last of it has arrived, then it
   * is closed. Whatever is still unpaid is then due to the vendor (see `payOrder`).
   * `projectId` limits the check to one project (a project manager can only receive their own orders).
   */
  async receive(input: unknown, projectId?: string): Promise<MaterialRequest> {
    const data = receiveSchema.parse(input);
    return withLock(`order:${data.requestId}`, () => this.receiveNow(data, projectId));
  }

  private async receiveNow(data: z.output<typeof receiveSchema>, projectId?: string): Promise<MaterialRequest> {
    const request = await this.getRequest(data.requestId);
    if (projectId && request.projectId !== projectId) throw notFound("Request");
    if (request.status !== "ordered") throw new AppError("Only an order that is on its way can be marked received", 409);

    const { remainingQuantity } = receivedOf(request);
    const quantity = data.quantity ?? remainingQuantity;
    if (quantity > remainingQuantity) throw new AppError(`Only ${remainingQuantity} is still to come on this order`, 400);

    // Two orders of the same material for one project can arrive together: the stock line is changed one at a time.
    await withLock(`stock:${request.projectId}:${request.materialId}`, async () => {
      const stock = (await this.repo.findStock(request.projectId, request.materialId)) ?? {
        id: newId("s"),
        projectId: request.projectId,
        materialId: request.materialId,
        quantity: 0,
        used: 0,
        minLevel: 0,
      };
      await this.repo.saveStock({ ...stock, quantity: stock.quantity + quantity });
    });
    const now = today();
    const deliveries: Delivery[] = [...(request.deliveries ?? []), { date: now, quantity }];
    const complete = quantity === remainingQuantity;
    return this.repo.saveRequest({ ...request, deliveries, ...(complete ? { status: "fulfilled" as const, receivedAt: now } : {}) });
  }

  /** Orders that arrived and still have money owed to the vendor. */
  async paymentsDue(): Promise<MaterialRequestView[]> {
    return (await this.listRequests({ status: "fulfilled" })).filter((r) => r.balanceDue > 0);
  }

  /** The Super Admin sends the vendor the rest of the money (all of it, or `amount`). It is debited from the project's accounts. */
  async payOrder(input: unknown): Promise<MaterialRequest> {
    const data = payOrderSchema.parse(input);
    return withLock(`order:${data.requestId}`, () => this.payNow(data));
  }

  private async payNow(data: z.output<typeof payOrderSchema>): Promise<MaterialRequest> {
    const request = await this.getRequest(data.requestId);
    if (request.totalAmount === undefined || !request.vendor) throw new AppError("This order has no amount to pay", 409);
    if (request.status !== "fulfilled") throw new AppError("Pay the balance after the material has been delivered", 409);
    const balance = request.totalAmount - (request.amountPaid ?? 0);
    if (balance <= 0) throw new AppError("This order is already paid in full", 409);
    const amount = data.amount ?? balance;
    if (amount > balance) throw new AppError(`Only ${balance} is left to pay on this order`, 400);

    const now = today();
    await this.debit(request, amount, now, `${amount === balance ? "Balance" : "Part payment"} for ${await this.materialName(request)} order`, request.vendor);
    const paid = (request.amountPaid ?? 0) + amount;
    const payments: OrderPayment[] = [...(request.payments ?? []), { date: now, amount }];
    return this.repo.saveRequest({ ...request, amountPaid: paid, payments, ...(paid >= request.totalAmount ? { paidAt: now } : {}) });
  }

  /**
   * Super Admin turns down a pending request, or cancels an order that has not arrived. Nothing is added to the inventory.
   * An advance that was already paid stays in the project's accounts: it has to be got back from the vendor.
   */
  async rejectRequest(input: unknown): Promise<MaterialRequest> {
    const data = z.object({ requestId: z.string().min(1), note: z.string().trim().max(500).default("") }).parse(input);
    return withLock(`order:${data.requestId}`, () => this.rejectNow(data));
  }

  private async rejectNow(data: { requestId: string; note: string }): Promise<MaterialRequest> {
    const request = await this.getRequest(data.requestId);
    if (request.status !== "pending" && request.status !== "ordered") {
      throw new AppError("Only a pending request or an order that has not arrived can be rejected", 409);
    }
    const advance = request.amountPaid ?? 0;
    const base = data.note || (request.status === "ordered" ? "Order cancelled" : "Rejected by the Super Admin");
    return this.repo.saveRequest({
      ...request,
      status: "rejected",
      decisionNote: advance > 0 ? `${base}. Advance of ${advance} was already paid to ${request.vendor}.` : base,
      decidedAt: today(),
    });
  }

  /** Material consumed on site. */
  async recordUsage(input: unknown): Promise<StockItem> {
    const data = usageSchema.parse(input);
    return withLock(`stock:${data.projectId}:${data.materialId}`, async () => {
      const stock = await this.repo.findStock(data.projectId, data.materialId);
      if (!stock) throw notFound("Stock item");
      if (stock.quantity < data.quantity) throw new AppError("Not enough stock on site", 409);
      return this.repo.saveStock({ ...stock, quantity: stock.quantity - data.quantity, used: stock.used + data.quantity });
    });
  }
}
