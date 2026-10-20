import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { ZodError } from "zod";
import { MockAccountRepository } from "@/repositories/mock/account.repository";
import { MockHrRepository } from "@/repositories/mock/hr.repository";
import { MockInventoryRepository } from "@/repositories/mock/inventory.repository";
import { MockProjectRepository } from "@/repositories/mock/project.repository";
import { MockSalesRepository } from "@/repositories/mock/sales.repository";
import { getStore } from "@/repositories/mock/store";
import { MockChangeRequestRepository } from "@/repositories/mock/change-request.repository";
import { AccountService } from "@/services/account.service";
import { ChangeRequestService } from "@/services/change-request.service";
import { HrService } from "@/services/hr.service";
import { InventoryService } from "@/services/inventory.service";
import { SalesService } from "@/services/sales.service";
import { addMonths } from "@/utils/date";
import { today } from "@/utils/id";

const projects = new MockProjectRepository();
const accounts = new AccountService(new MockAccountRepository(), projects);
const inventory = new InventoryService(new MockInventoryRepository(), projects);
const hr = new HrService(new MockHrRepository(), projects);
const sales = new SalesService(new MockSalesRepository(), projects);

beforeEach(() => {
  // fresh seed for every test
  delete (globalThis as Record<string, unknown>).__crm_mock_store__;
});

describe("repositories", () => {
  it("do not expose the internal store to callers", async () => {
    const list = await projects.list();
    list[0].name = "mutated";
    assert.notEqual((await projects.list())[0].name, "mutated");
  });
});

describe("accounts", () => {
  it("computes the net balance", async () => {
    const summary = await accounts.summary("p1");
    assert.equal(summary.balance, summary.credit + summary.sales - summary.debit - summary.expense - summary.purchase);
  });

  it("rejects a negative amount and an unknown project", async () => {
    await assert.rejects(accounts.addEntry({ projectId: "p1", type: "expense", amount: -5, description: "x" }), ZodError);
    await assert.rejects(accounts.addEntry({ projectId: "nope", type: "expense", amount: 5, description: "x" }), /not found/);
  });
});

describe("material workflow", () => {
  it("request -> approve moves stock from warehouse to project", async () => {
    const before = await inventory.warehouseStock();
    const cementBefore = before.find((s) => s.materialId === "m2")!.quantity;
    const siteBefore = (await inventory.projectStock("p2")).find((s) => s.materialId === "m2")!.quantity;

    const request = await inventory.createRequest({ projectId: "p2", materialId: "m2", quantity: 500, requestedBy: "Sana" });
    assert.equal(request.status, "pending");
    await assert.rejects(inventory.fulfill(request.id), /approved/);

    const decided = await inventory.decide({ requestId: request.id, decision: "approved" });
    assert.equal(decided.status, "fulfilled");
    await assert.rejects(inventory.fulfill(request.id), /approved/); // cannot be issued twice

    assert.equal((await inventory.warehouseStock()).find((s) => s.materialId === "m2")!.quantity, cementBefore - 500);
    assert.equal((await inventory.projectStock("p2")).find((s) => s.materialId === "m2")!.quantity, siteBefore + 500);
  });

  it("cannot decide twice or issue more than the warehouse holds", async () => {
    const request = await inventory.createRequest({ projectId: "p1", materialId: "m6", quantity: 1000, requestedBy: "Bilal" });
    await inventory.decide({ requestId: request.id, decision: "approved" });
    await assert.rejects(inventory.decide({ requestId: request.id, decision: "rejected" }), /already decided/);
    await assert.rejects(inventory.fulfill(request.id), /Not enough stock/);
  });

  it("recording usage reduces stock and increases used", async () => {
    const before = (await inventory.projectStock("p1")).find((s) => s.materialId === "m1")!;
    await inventory.recordUsage({ projectId: "p1", materialId: "m1", quantity: 10 });
    const after = (await inventory.projectStock("p1")).find((s) => s.materialId === "m1")!;
    assert.equal(after.quantity, before.quantity - 10);
    assert.equal(after.used, before.used + 10);
  });
});

describe("hr", () => {
  it("requires a wage that matches the worker type", async () => {
    await assert.rejects(hr.addWorker({ projectId: "p1", name: "A", type: "labour", role: "Mason" }), ZodError);
    const added = await hr.addWorker({ projectId: "p1", name: "A", type: "labour", role: "Mason", dailyWage: 2000 });
    assert.equal(added.active, true);
  });

  it("cancels unfinished work but keeps completed work", async () => {
    const task = await hr.assignTask({ projectId: "p1", workerId: "w1", task: "Test task", dueDate: "2026-10-30", payment: 4000 });
    await hr.cancelTask(task.id);
    assert.equal((await hr.listAssignments("p1")).some((a) => a.id === task.id), false);
    await assert.rejects(hr.cancelTask("a4"), /cannot be cancelled/);
  });

  it("lists a monthly salary as pending one month after joining, not before", async () => {
    const worker = await hr.addWorker({ projectId: "p1", name: "New Engineer", type: "employee", role: "engineer", monthlySalary: 100000 });
    const pendingFor = async () => (await hr.pendingPayroll("p1")).filter((i) => i.workerId === worker.id);
    assert.equal((await pendingFor()).length, 0);

    getStore().workers.find((w) => w.id === worker.id)!.joinedAt = addMonths(today(), -2);
    const items = await pendingFor();
    assert.equal(items.length, 2);
    assert.equal(items[0].amount, 100000);
    assert.equal(items[0].dueDate, addMonths(today(), -1));
  });

  it("counts a payment in the payroll only after the Super Admin pays it", async () => {
    const before = await hr.summary("p1");
    const task = await hr.assignTask({ projectId: "p1", workerId: "w3", task: "Paid task", dueDate: "2026-10-30", payment: 7000 });
    await hr.setTaskStatus(task.id, "done");

    const done = await hr.summary("p1");
    assert.equal(done.pendingPayroll, before.pendingPayroll + 7000);
    assert.equal(done.monthlyPayroll, before.monthlyPayroll);

    await hr.pay({ projectId: "p1", workerId: "w3", kind: "task", ref: task.id });
    const paid = await hr.summary("p1");
    assert.equal(paid.pendingPayroll, before.pendingPayroll);
    assert.equal(paid.monthlyPayroll, before.monthlyPayroll + 7000);
    assert.equal((await hr.paidPayroll("p1")).some((i) => i.ref === task.id && i.amount === 7000), true);

    await assert.rejects(hr.pay({ projectId: "p1", workerId: "w3", kind: "task", ref: task.id }), /already paid/);
    await assert.rejects(hr.pay({ projectId: "p1", workerId: "w3", kind: "task", ref: "nope" }), /Nothing is pending/);
  });

  it("groups completed work by day for the daily report", async () => {
    const task = await hr.assignTask({ projectId: "p1", workerId: "w3", task: "Report task", dueDate: "2026-10-30", payment: 2500 });
    await hr.setTaskStatus(task.id, "done");
    const report = await hr.workReport("p1");
    assert.equal(report.date, today());
    assert.equal(report.items.some((i) => i.id === task.id), true);
    assert.equal(report.total, report.items.reduce((sum, i) => sum + i.payment, 0));
    assert.equal(report.days.find((d) => d.date === today())?.count, report.items.length);
    assert.equal((await hr.workReport("p1", "2020-01-01")).items.length, 0);
  });

  it("removes a worker together with their tasks", async () => {
    await hr.removeWorker("w3");
    assert.equal(getStore().assignments.some((a) => a.workerId === "w3"), false);
    await assert.rejects(hr.removeWorker("w3"), /not found/);
  });

  it("pays labour per day present and employees a fixed salary", async () => {
    const workers = await hr.listWorkers("p1", "2026-10");
    const labour = workers.find((w) => w.id === "w3")!;
    const employee = workers.find((w) => w.id === "w1")!;
    assert.equal(labour.earned, labour.dailyWage * labour.daysWorked);
    assert.equal(employee.earned, employee.monthlySalary);
  });
});

describe("sales", () => {
  it("calculates commission per agent rate", async () => {
    const report = await sales.report();
    const hassan = report.agents.find((a) => a.agentId === "ag1")!;
    assert.equal(hassan.commission, Math.round(18_500_000 * 0.02));
  });

  it("recording a sale marks the lead as won", async () => {
    await sales.recordSale({ projectId: "p1", agentId: "ag1", leadId: "l2", unit: "Flat C-1", price: 10_000_000 });
    const lead = (await sales.listLeads()).find((l) => l.id === "l2")!;
    assert.equal(lead.status, "won");
  });

  it("rejects invalid leads", async () => {
    await assert.rejects(sales.addLead({ name: "", phone: "1", projectId: "p1", source: "facebook" }), ZodError);
  });
});

describe("people change requests", () => {
  const changes = new ChangeRequestService(new MockChangeRequestRepository(), projects, hr, sales);

  it("add request changes nothing until approved", async () => {
    const before = (await hr.listWorkers("p1")).length;
    const request = await changes.submit({
      kind: "worker",
      action: "add",
      projectId: "p1",
      payload: { name: "New Mason", type: "labour", role: "Mason", dailyWage: 2600 },
    });
    assert.equal(request.status, "pending");
    assert.equal(request.requestedBy, "Bilal Ahmed");
    assert.equal((await hr.listWorkers("p1")).length, before);

    await changes.decide({ requestId: request.id, decision: "approved" });
    assert.equal((await hr.listWorkers("p1")).length, before + 1);
  });

  it("rejected request leaves the person untouched", async () => {
    const request = await changes.submit({ kind: "worker", action: "remove", targetId: "w3" });
    await changes.decide({ requestId: request.id, decision: "rejected", note: "still needed" });
    assert.ok(await hr.getWorker("w3"));
  });

  it("approved edit and removal are applied", async () => {
    const edit = await changes.submit({
      kind: "worker",
      action: "edit",
      targetId: "w3",
      payload: { name: "Rafiq", type: "labour", role: "Senior Mason", dailyWage: 3200 },
    });
    await changes.decide({ requestId: edit.id, decision: "approved" });
    assert.equal((await hr.getWorker("w3")).dailyWage, 3200);

    const removal = await changes.submit({ kind: "worker", action: "remove", targetId: "w3" });
    await changes.decide({ requestId: removal.id, decision: "approved" });
    await assert.rejects(hr.getWorker("w3"), /not found/);
  });

  it("blocks a second pending change for the same person and invalid payloads", async () => {
    await changes.submit({ kind: "agent", action: "remove", targetId: "ag3" });
    await assert.rejects(changes.submit({ kind: "agent", action: "edit", targetId: "ag3", payload: { name: "X", commissionRate: 3 } }), /already waiting/);
    await assert.rejects(changes.submit({ kind: "worker", action: "add", projectId: "p1", payload: { name: "", type: "labour", role: "x" } }), ZodError);
  });

  it("removing an agent keeps past sales but hides them from new work", async () => {
    const request = await changes.submit({ kind: "agent", action: "remove", targetId: "ag1" });
    await changes.decide({ requestId: request.id, decision: "approved" });
    assert.equal((await sales.getAgent("ag1")).active, false);
    assert.ok((await sales.report()).agents.some((a) => a.agentId === "ag1")); // has sales, commission still owed
    await assert.rejects(changes.decide({ requestId: request.id, decision: "approved" }), /already decided/);
  });
});

describe("approval adds stock to the project inventory", () => {
  it("approve moves stock immediately when the warehouse has enough", async () => {
    const siteBefore = (await inventory.projectStock("p1")).find((s) => s.materialId === "m3")!.quantity;
    const whBefore = (await inventory.warehouseStock()).find((s) => s.materialId === "m3")!.quantity;
    const decided = await inventory.decide({ requestId: "r1", decision: "approved" }); // 200 premix
    assert.equal(decided.status, "fulfilled");
    assert.equal((await inventory.projectStock("p1")).find((s) => s.materialId === "m3")!.quantity, siteBefore + 200);
    assert.equal((await inventory.warehouseStock()).find((s) => s.materialId === "m3")!.quantity, whBefore - 200);
  });

  it("stays approved when the warehouse is short, and rejection moves nothing", async () => {
    const short = await inventory.createRequest({ projectId: "p1", materialId: "m6", quantity: 1000, requestedBy: "Bilal" });
    assert.equal((await inventory.decide({ requestId: short.id, decision: "approved" })).status, "approved");
    const rejected = await inventory.createRequest({ projectId: "p1", materialId: "m2", quantity: 10, requestedBy: "Bilal" });
    const before = (await inventory.projectStock("p1")).find((s) => s.materialId === "m2")!.quantity;
    await inventory.decide({ requestId: rejected.id, decision: "rejected" });
    assert.equal((await inventory.projectStock("p1")).find((s) => s.materialId === "m2")!.quantity, before);
  });
});
