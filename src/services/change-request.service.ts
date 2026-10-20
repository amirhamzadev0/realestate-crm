import { z } from "zod";
import type { ChangeRequest, ChangeRequestView, ChangeStatus } from "@/models/changes";
import type { ChangeRequestRepository, ProjectRepository } from "@/repositories/contracts";
import { AppError, notFound } from "@/utils/errors";
import { formatMoney } from "@/utils/format";
import { newId, today } from "@/utils/id";
import { workerSchema, type HrService } from "./hr.service";
import { agentSchema, type SalesService } from "./sales.service";

export const changeRequestSchema = z.object({
  kind: z.enum(["worker", "agent"]),
  action: z.enum(["add", "edit", "remove"]),
  projectId: z.string().min(1).optional(),
  targetId: z.string().min(1).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const changeDecisionSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).default(""),
});

function describe(request: ChangeRequest): string {
  const p = request.payload ?? {};
  if (request.kind === "worker") {
    if (request.action === "remove") return `Remove ${request.targetName} from the project`;
    const pay = p.type === "employee" ? `${formatMoney(Number(p.monthlySalary))}/month` : `${formatMoney(Number(p.dailyWage))}/day`;
    const detail = `${p.type}, ${p.role}, ${pay}`;
    return request.action === "add" ? `Add ${p.name} (${detail})` : `Edit ${request.targetName}: ${p.name} (${detail})`;
  }
  if (request.action === "remove") return `Remove agent ${request.targetName}`;
  const detail = `${p.commissionRate}% commission`;
  return request.action === "add" ? `Add agent ${p.name} (${detail})` : `Edit agent ${request.targetName}: ${p.name} (${detail})`;
}

export class ChangeRequestService {
  constructor(
    private repo: ChangeRequestRepository,
    private projects: ProjectRepository,
    private hr: HrService,
    private sales: SalesService,
  ) {}

  async list(filter?: {
    projectId?: string;
    status?: ChangeStatus;
    kind?: ChangeRequest["kind"];
  }): Promise<ChangeRequestView[]> {
    const [requests, projects] = await Promise.all([this.repo.list(filter), this.projects.list()]);
    const names = new Map(projects.map((p) => [p.id, p.name]));
    return requests.map((r) => ({
      ...r,
      projectName: r.projectId ? (names.get(r.projectId) ?? "Unknown") : "Sales department",
      summary: describe(r),
    }));
  }

  /** Validates the change now, but applies nothing until the Super Admin approves. */
  async submit(input: unknown): Promise<ChangeRequest> {
    const data = changeRequestSchema.parse(input);

    if (data.action !== "add") {
      if (!data.targetId) throw new AppError("targetId is required", 400);
      const pending = await this.repo.list({ status: "pending", kind: data.kind });
      if (pending.some((r) => r.targetId === data.targetId)) {
        throw new AppError("A change for this person is already waiting for approval", 409);
      }
    }
    if (data.action !== "remove" && !data.payload) throw new AppError("payload is required", 400);

    let projectId: string | null = null;
    let targetName = "";
    let requestedBy = "Sales department";
    let payload: Record<string, unknown> | null = null;

    if (data.kind === "worker") {
      if (data.action === "add") {
        projectId = data.projectId ?? null;
      } else {
        const worker = await this.hr.getWorker(data.targetId as string);
        projectId = worker.projectId;
        targetName = worker.name;
      }
      const project = projectId ? await this.projects.findById(projectId) : null;
      if (!project) throw notFound("Project");
      requestedBy = project.adminName;
      if (data.action !== "remove") {
        const { projectId: _ignored, ...rest } = workerSchema.parse({ ...data.payload, projectId });
        payload = rest;
      }
    } else {
      if (data.action !== "add") targetName = (await this.sales.getAgent(data.targetId as string)).name;
      if (data.action !== "remove") payload = agentSchema.parse(data.payload);
    }

    return this.repo.save({
      id: newId("cr"),
      kind: data.kind,
      action: data.action,
      projectId,
      targetId: data.targetId ?? null,
      targetName,
      payload,
      requestedBy,
      createdAt: today(),
      status: "pending",
    });
  }

  /** Super Admin decision. Approving applies the change. */
  async decide(input: unknown): Promise<ChangeRequest> {
    const data = changeDecisionSchema.parse(input);
    const request = await this.repo.find(data.requestId);
    if (!request) throw notFound("Request");
    if (request.status !== "pending") throw new AppError("Request was already decided", 409);

    if (data.decision === "approved") await this.apply(request);
    return this.repo.save({ ...request, status: data.decision, decisionNote: data.note, decidedAt: today() });
  }

  private async apply(request: ChangeRequest): Promise<void> {
    const payload = request.payload;
    const target = request.targetId as string;
    if (request.kind === "worker") {
      if (request.action === "add") await this.hr.addWorker({ ...payload, projectId: request.projectId });
      else if (request.action === "edit") await this.hr.updateWorker(target, payload);
      else await this.hr.removeWorker(target);
    } else {
      if (request.action === "add") await this.sales.addAgent(payload);
      else if (request.action === "edit") await this.sales.updateAgent(target, payload);
      else await this.sales.removeAgent(target);
    }
  }
}
