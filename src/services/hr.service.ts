import { z } from "zod";
import type { AssignmentStatus, HrSummary, Worker, WorkAssignment, WorkerView } from "@/models/hr";
import type { HrRepository, ProjectRepository } from "@/repositories/contracts";
import { notFound } from "@/utils/errors";
import { newId, today } from "@/utils/id";

export const workerSchema = z
  .object({
    projectId: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    type: z.enum(["employee", "labour"]),
    role: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(40).default(""),
    monthlySalary: z.number().min(0).max(100_000_000).default(0),
    dailyWage: z.number().min(0).max(1_000_000).default(0),
  })
  .refine((w) => (w.type === "employee" ? w.monthlySalary > 0 : w.dailyWage > 0), {
    message: "Employees need a monthly salary, labour needs a daily wage",
  });

export const assignmentSchema = z.object({
  projectId: z.string().min(1),
  workerId: z.string().min(1),
  task: z.string().trim().min(1).max(200),
  dueDate: z.iso.date(),
});

export const attendanceSchema = z.object({
  workerId: z.string().min(1),
  date: z.iso.date(),
  status: z.enum(["present", "absent", "half-day"]),
});

const DAY_FACTOR = { present: 1, "half-day": 0.5, absent: 0 } as const;

export class HrService {
  constructor(
    private repo: HrRepository,
    private projects: ProjectRepository,
  ) {}

  async listWorkers(projectId: string, month = today().slice(0, 7)): Promise<WorkerView[]> {
    const [workers, attendance, assignments] = await Promise.all([
      this.repo.listWorkers(projectId),
      this.repo.listAttendance(projectId),
      this.repo.listAssignments(projectId),
    ]);
    return workers.map((worker) => {
      const daysWorked = attendance
        .filter((a) => a.workerId === worker.id && a.date.startsWith(month))
        .reduce((sum, a) => sum + DAY_FACTOR[a.status], 0);
      const earned = worker.type === "employee" ? worker.monthlySalary : worker.dailyWage * daysWorked;
      return { ...worker, daysWorked, earned, tasks: assignments.filter((a) => a.workerId === worker.id) };
    });
  }

  async summary(projectId: string): Promise<HrSummary> {
    const workers = (await this.listWorkers(projectId)).filter((w) => w.active);
    return {
      employees: workers.filter((w) => w.type === "employee").length,
      labour: workers.filter((w) => w.type === "labour").length,
      monthlyPayroll: workers.reduce((sum, w) => sum + w.earned, 0),
    };
  }

  async listAssignments(projectId: string): Promise<(WorkAssignment & { workerName: string })[]> {
    const [assignments, workers] = await Promise.all([
      this.repo.listAssignments(projectId),
      this.repo.listWorkers(projectId),
    ]);
    const names = new Map(workers.map((w) => [w.id, w.name]));
    return assignments.map((a) => ({ ...a, workerName: names.get(a.workerId) ?? "Removed" }));
  }

  async addWorker(input: unknown): Promise<Worker> {
    const data = workerSchema.parse(input);
    if (!(await this.projects.findById(data.projectId))) throw notFound("Project");
    return this.repo.saveWorker({ ...data, id: newId("w"), active: true });
  }

  async getWorker(id: string): Promise<Worker> {
    const worker = await this.repo.findWorker(id);
    if (!worker) throw notFound("Worker");
    return worker;
  }

  /** Replaces the editable fields. The project cannot change. */
  async updateWorker(id: string, input: unknown): Promise<Worker> {
    const existing = await this.getWorker(id);
    const data = workerSchema.parse({ ...(input as object), projectId: existing.projectId });
    return this.repo.saveWorker({ ...existing, ...data });
  }

  async removeWorker(id: string): Promise<void> {
    if (!(await this.repo.removeWorker(id))) throw notFound("Worker");
  }

  async assignTask(input: unknown): Promise<WorkAssignment> {
    const data = assignmentSchema.parse(input);
    const worker = await this.repo.findWorker(data.workerId);
    if (!worker || worker.projectId !== data.projectId) throw notFound("Worker");
    return this.repo.saveAssignment({ ...data, id: newId("a"), status: "todo" });
  }

  async setTaskStatus(id: string, status: AssignmentStatus): Promise<WorkAssignment> {
    const updated = await this.repo.setAssignmentStatus(id, z.enum(["todo", "in-progress", "done"]).parse(status));
    if (!updated) throw notFound("Task");
    return updated;
  }

  async markAttendance(input: unknown) {
    const data = attendanceSchema.parse(input);
    if (!(await this.repo.findWorker(data.workerId))) throw notFound("Worker");
    return this.repo.saveAttendance({ ...data, id: newId("at") });
  }
}
