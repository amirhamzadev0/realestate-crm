import { z } from "zod";
import type { AssignmentStatus, DaySummary, HrSummary, PayrollItem, Worker, WorkAssignment, WorkerView } from "@/models/hr";
import type { HrRepository, ProjectRepository } from "@/repositories/contracts";
import { AppError, notFound } from "@/utils/errors";
import { addMonths } from "@/utils/date";
import { formatDate } from "@/utils/format";
import { newId, today } from "@/utils/id";
import { withLock } from "@/utils/lock";

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
  payment: z.number().min(0).max(100_000_000).default(0),
});

export const paySchema = z.object({
  projectId: z.string().min(1),
  workerId: z.string().min(1),
  kind: z.enum(["salary", "task"]),
  ref: z.string().min(1).max(64),
});

export const attendanceSchema = z.object({
  workerId: z.string().min(1),
  date: z.iso.date(),
  status: z.enum(["present", "absent", "half-day"]),
});

const DAY_FACTOR = { present: 1, "half-day": 0.5, absent: 0 } as const;

const samePayment = (payment: { workerId: string; kind: string; ref: string }, item: { workerId: string; kind: string; ref: string }) =>
  payment.workerId === item.workerId && payment.kind === item.kind && payment.ref === item.ref;

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

  /** Headcount, what has been paid out this month, and what is still owed. */
  async summary(projectId: string): Promise<HrSummary> {
    const month = today().slice(0, 7);
    const [workers, ledger, payments] = await Promise.all([
      this.repo.listWorkers(projectId),
      this.dues(projectId),
      this.repo.listPayments(projectId),
    ]);
    const active = workers.filter((w) => w.active);
    const pending = ledger.filter((item) => !payments.some((p) => samePayment(p, item)));
    return {
      employees: active.filter((w) => w.type === "employee").length,
      labour: active.filter((w) => w.type === "labour").length,
      monthlyPayroll: payments.filter((p) => p.paidAt.startsWith(month)).reduce((sum, p) => sum + p.amount, 0),
      pendingPayroll: pending.reduce((sum, item) => sum + item.amount, 0),
      pendingCount: pending.length,
    };
  }

  /**
   * Everything that has become payable: a monthly salary for each full month since the employee joined, and
   * the payment of each finished task. Paid or not; the caller separates the two.
   */
  private async dues(projectId: string): Promise<PayrollItem[]> {
    const [workers, assignments] = await Promise.all([this.repo.listWorkers(projectId), this.repo.listAssignments(projectId)]);
    const byId = new Map(workers.map((w) => [w.id, w]));
    const now = today();
    const items: PayrollItem[] = [];

    for (const worker of workers) {
      if (!worker.active || worker.type !== "employee" || worker.monthlySalary <= 0) continue;
      for (let cycle = 1; addMonths(worker.joinedAt, cycle) <= now; cycle++) {
        const from = addMonths(worker.joinedAt, cycle - 1);
        const due = addMonths(worker.joinedAt, cycle);
        items.push({
          kind: "salary",
          ref: String(cycle),
          projectId,
          workerId: worker.id,
          workerName: worker.name,
          workerType: worker.type,
          description: `Monthly salary, ${formatDate(from)} to ${formatDate(due)}`,
          dueDate: due,
          amount: worker.monthlySalary,
        });
      }
    }

    for (const task of assignments) {
      const worker = byId.get(task.workerId);
      if (!worker || task.status !== "done" || task.payment <= 0) continue;
      items.push({
        kind: "task",
        ref: task.id,
        projectId,
        workerId: worker.id,
        workerName: worker.name,
        workerType: worker.type,
        description: `Completed work: ${task.task}`,
        dueDate: task.completedAt ?? task.assignedAt,
        amount: task.payment,
      });
    }
    return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  /** Salaries and task payments that are due and have not been handed over yet. */
  async pendingPayroll(projectId: string): Promise<PayrollItem[]> {
    const [ledger, payments] = await Promise.all([this.dues(projectId), this.repo.listPayments(projectId)]);
    return ledger.filter((item) => !payments.some((p) => samePayment(p, item)));
  }

  /** Payments already made, newest first. */
  async paidPayroll(projectId: string): Promise<PayrollItem[]> {
    const [ledger, payments, workers] = await Promise.all([
      this.dues(projectId),
      this.repo.listPayments(projectId),
      this.repo.listWorkers(projectId),
    ]);
    const names = new Map(workers.map((w) => [w.id, w]));
    return payments
      .map((payment): PayrollItem => {
        const due = ledger.find((item) => samePayment(payment, item));
        const worker = names.get(payment.workerId);
        return {
          kind: payment.kind,
          ref: payment.ref,
          projectId,
          workerId: payment.workerId,
          workerName: worker?.name ?? "Removed",
          workerType: worker?.type ?? "labour",
          description: due?.description ?? (payment.kind === "salary" ? "Monthly salary" : "Completed work"),
          dueDate: due?.dueDate ?? payment.paidAt,
          amount: payment.amount,
          paidAt: payment.paidAt,
        };
      })
      .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  }

  /** The Super Admin hands over one pending salary or task payment. The amount is the one calculated here, never the browser's. */
  async pay(input: unknown): Promise<PayrollItem> {
    const data = paySchema.parse(input);
    return withLock(`pay:${data.workerId}:${data.kind}:${data.ref}`, () => this.payNow(data));
  }

  private async payNow(data: z.output<typeof paySchema>): Promise<PayrollItem> {
    if (!(await this.projects.findById(data.projectId))) throw notFound("Project");
    const item = (await this.pendingPayroll(data.projectId)).find(
      (i) => i.workerId === data.workerId && i.kind === data.kind && i.ref === data.ref,
    );
    if (!item) throw new AppError("Nothing is pending for this payment (already paid?)", 409);
    const paidAt = today();
    await this.repo.savePayment({ id: newId("pay"), projectId: data.projectId, workerId: data.workerId, kind: data.kind, ref: data.ref, amount: item.amount, paidAt });
    return { ...item, paidAt };
  }

  /** Completed work for one day plus a total for every day that has records, newest first. */
  async workReport(
    projectId: string,
    date = today(),
  ): Promise<{ date: string; items: (WorkAssignment & { workerName: string })[]; total: number; days: DaySummary[] }> {
    const done = (await this.listAssignments(projectId)).filter((a) => a.status === "done");
    const dayOf = (a: WorkAssignment) => a.completedAt ?? a.assignedAt;
    const byDay = new Map<string, DaySummary>();
    for (const a of done) {
      const entry = byDay.get(dayOf(a)) ?? { date: dayOf(a), count: 0, total: 0 };
      entry.count += 1;
      entry.total += a.payment;
      byDay.set(dayOf(a), entry);
    }
    const items = done.filter((a) => dayOf(a) === date);
    return {
      date,
      items,
      total: items.reduce((sum, a) => sum + a.payment, 0),
      days: [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date)),
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
    return this.repo.saveWorker({ ...data, id: newId("w"), active: true, joinedAt: today() });
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
    return this.repo.saveAssignment({ ...data, id: newId("a"), status: "todo", assignedAt: today() });
  }

  async setTaskStatus(id: string, status: AssignmentStatus): Promise<WorkAssignment> {
    const next = z.enum(["todo", "in-progress", "done"]).parse(status);
    const updated = await this.repo.setAssignmentStatus(id, next, next === "done" ? today() : null);
    if (!updated) throw notFound("Task");
    return updated;
  }

  /** Withdraws a task that has not been finished. Completed work stays on record because it has been paid for. */
  async cancelTask(id: string, projectId?: string): Promise<void> {
    const task = await this.findAssignment(id, projectId);
    if (task.status === "done") throw new AppError("Completed work cannot be cancelled", 409);
    await this.repo.removeAssignment(id);
  }

  private async findAssignment(id: string, projectId?: string): Promise<WorkAssignment> {
    const projectIds = projectId ? [projectId] : (await this.projects.list()).map((p) => p.id);
    for (const pid of projectIds) {
      const found = (await this.repo.listAssignments(pid)).find((a) => a.id === id);
      if (found) return found;
    }
    throw notFound("Task");
  }

  async markAttendance(input: unknown) {
    const data = attendanceSchema.parse(input);
    if (!(await this.repo.findWorker(data.workerId))) throw notFound("Worker");
    return this.repo.saveAttendance({ ...data, id: newId("at") });
  }
}
