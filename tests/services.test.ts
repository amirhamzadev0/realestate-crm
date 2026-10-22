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
import { ProjectService } from "@/services/project.service";
import { SalesService } from "@/services/sales.service";
import { MockManagerRepository } from "@/repositories/mock/manager.repository";
import { addMonths } from "@/utils/date";
import { today } from "@/utils/id";

const projects = new MockProjectRepository();
const projectService = new ProjectService(projects, new MockManagerRepository(), new MockSalesRepository());
const accounts = new AccountService(new MockAccountRepository(), projects);
const inventory = new InventoryService(new MockInventoryRepository(), projects, new MockAccountRepository());
const hr = new HrService(new MockHrRepository(), projects);
const sales = new SalesService(new MockSalesRepository(), projects, new MockAccountRepository());

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

const ORDER = { vendor: "Ali Traders", totalAmount: 100_000 };

describe("material workflow", () => {
  const siteQty = async (projectId: string, materialId: string) =>
    (await inventory.projectStock(projectId)).find((s) => s.materialId === materialId)?.quantity ?? 0;

  it("a request waits for the Super Admin, approving it places the order, and delivery fills the project inventory", async () => {
    const before = await siteQty("p2", "m2");
    const request = await inventory.createRequest({ projectId: "p2", materialId: "m2", quantity: 500, requestedBy: "Sana" });
    assert.equal(request.status, "pending");
    await assert.rejects(inventory.receive(request.id), /on its way/); // nothing to receive before it is ordered

    const ordered = await inventory.decide({ requestId: request.id, decision: "approved", ...ORDER });
    assert.equal(ordered.status, "ordered");
    assert.equal(ordered.orderedAt, today());
    assert.equal(await siteQty("p2", "m2"), before); // ordered is not delivered: the inventory has not changed yet

    const received = await inventory.receive(request.id);
    assert.equal(received.status, "fulfilled");
    assert.equal(received.receivedAt, today());
    assert.equal(await siteQty("p2", "m2"), before + 500);
    await assert.rejects(inventory.receive(request.id), /on its way/); // cannot be received twice
    await assert.rejects(inventory.decide({ requestId: request.id, decision: "rejected" }), /already decided/);
  });

  it("rejecting a request moves nothing and keeps the reason for the project manager", async () => {
    const before = await siteQty("p1", "m2");
    const request = await inventory.createRequest({ projectId: "p1", materialId: "m2", quantity: 10, requestedBy: "Bilal" });
    const rejected = await inventory.decide({ requestId: request.id, decision: "rejected", note: "Budget exceeded" });
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.decisionNote, "Budget exceeded");
    assert.equal(await siteQty("p1", "m2"), before);
    await assert.rejects(inventory.receive(request.id), /on its way/);
  });

  it("the Super Admin can order for a project directly, and it is recorded as an order", async () => {
    const before = await siteQty("p3", "m1"); // no steel on site yet
    const order = await inventory.orderDirect({ ...ORDER, projectId: "p3", materialId: "m1", quantity: 40, note: "Foundation" });
    assert.equal(order.status, "ordered");
    assert.equal(order.requestedBy, "Super Admin (ordered directly)");
    assert.equal((await inventory.listRequests({ projectId: "p3", status: "ordered" })).some((r) => r.id === order.id), true);
    assert.equal(await siteQty("p3", "m1"), before);
    await inventory.receive(order.id);
    assert.equal(await siteQty("p3", "m1"), before + 40); // a first delivery creates the stock line
    await assert.rejects(inventory.orderDirect({ ...ORDER, projectId: "nope", materialId: "m1", quantity: 1 }), /Project not found/);
    await assert.rejects(inventory.orderDirect({ ...ORDER, projectId: "p3", materialId: "nope", quantity: 1 }), /Material not found/);
  });

  it("a delivery is only accepted for the project it belongs to", async () => {
    const order = await inventory.orderDirect({ ...ORDER, projectId: "p1", materialId: "m4", quantity: 1000 });
    await assert.rejects(inventory.receive(order.id, "p2"), /Request not found/); // another project's manager
    assert.equal((await inventory.receive(order.id, "p1")).status, "fulfilled");
  });

  it("the Super Admin can cancel an order that has not arrived, but not one that has", async () => {
    const before = await siteQty("p1", "m5");
    const order = await inventory.orderDirect({ ...ORDER, projectId: "p1", materialId: "m5", quantity: 100 });
    const cancelled = await inventory.rejectRequest({ requestId: order.id });
    assert.equal(cancelled.status, "rejected");
    assert.equal(cancelled.decisionNote, "Order cancelled");
    await assert.rejects(inventory.receive(order.id), /on its way/);

    const delivered = await inventory.orderDirect({ ...ORDER, projectId: "p1", materialId: "m5", quantity: 100 });
    await inventory.receive(delivered.id);
    await assert.rejects(inventory.rejectRequest({ requestId: delivered.id }), /Only a pending request or an order/);
    assert.equal(await siteQty("p1", "m5"), before + 100);
  });

  it("an order needs a vendor and an amount, and an advance cannot be more than the amount", async () => {
    const base = { projectId: "p1", materialId: "m1", quantity: 1 };
    await assert.rejects(inventory.orderDirect({ ...base }), ZodError);
    await assert.rejects(inventory.orderDirect({ ...base, vendor: "", totalAmount: 10 }), ZodError);
    await assert.rejects(inventory.orderDirect({ ...base, vendor: "V", totalAmount: 0 }), ZodError);
    await assert.rejects(inventory.orderDirect({ ...base, vendor: "V", totalAmount: 100, paymentTerms: "advance" }), /Enter the advance amount/);
    await assert.rejects(inventory.orderDirect({ ...base, vendor: "V", totalAmount: 100, paymentTerms: "advance", advanceAmount: 101 }), /cannot be more than the order amount/);
    await assert.rejects(inventory.orderDirect({ ...base, vendor: "V", totalAmount: 100, orderDate: "2999-01-01" }), /cannot be in the future/);
    // approving a request needs the same details, and a rejection does not
    const request = await inventory.createRequest({ projectId: "p1", materialId: "m1", quantity: 1, requestedBy: "Bilal" });
    await assert.rejects(inventory.decide({ requestId: request.id, decision: "approved" }), ZodError);
    assert.equal((await inventory.decide({ requestId: request.id, decision: "rejected" })).status, "rejected");
  });

  it("pay on delivery: nothing is debited until the material is received, then the whole amount is due", async () => {
    const entries = async () => (await accounts.list("p2")).filter((e) => e.type === "debit" && e.party === "Lucky Cement");
    const before = (await entries()).length;
    const debitBefore = (await accounts.summary("p2")).debit;
    const order = await inventory.orderDirect({ projectId: "p2", materialId: "m2", quantity: 100, vendor: "Lucky Cement", totalAmount: 120_000, paymentTerms: "on-delivery", orderDate: "2026-10-01" });
    assert.equal(order.vendor, "Lucky Cement");
    assert.equal(order.totalAmount, 120_000);
    assert.equal(order.orderedAt, "2026-10-01"); // the day it was placed
    assert.equal(order.amountPaid, 0);
    assert.equal((await entries()).length, before);
    assert.equal((await inventory.paymentsDue()).some((r) => r.id === order.id), false); // not delivered yet

    await inventory.receive(order.id);
    const due = (await inventory.paymentsDue()).find((r) => r.id === order.id)!;
    assert.equal(due.balanceDue, 120_000);

    const balanceBefore = (await accounts.summary("p2")).balance;
    const paid = await inventory.payOrder({ requestId: order.id });
    assert.equal(paid.amountPaid, 120_000);
    assert.equal(paid.paidAt, today());
    assert.equal((await accounts.summary("p2")).balance, balanceBefore - 120_000); // debited from the project
    assert.equal((await accounts.summary("p2")).debit, debitBefore + 120_000); // and shown under "Total debit"
    const entry = (await entries()).find((e) => e.amount === 120_000)!;
    assert.equal(entry.party, "Lucky Cement");
    assert.match(entry.description, /Balance for Cement order/);
    assert.equal((await inventory.paymentsDue()).some((r) => r.id === order.id), false);
    await assert.rejects(inventory.payOrder({ requestId: order.id }), /already paid in full/);
  });

  it("advance: the advance is debited when the order is placed and only the rest is due after delivery", async () => {
    const summary = () => accounts.summary("p1");
    const start = (await summary()).balance;
    const request = await inventory.createRequest({ projectId: "p1", materialId: "m3", quantity: 50, requestedBy: "Bilal" });
    const order = await inventory.decide({ requestId: request.id, decision: "approved", vendor: "Premix Co", totalAmount: 500_000, paymentTerms: "advance", advanceAmount: 200_000 });
    assert.equal(order.status, "ordered");
    assert.equal(order.amountPaid, 200_000);
    assert.equal((await summary()).balance, start - 200_000); // debited straight away

    await assert.rejects(inventory.payOrder({ requestId: order.id }), /after the material has been delivered/);
    await inventory.receive(order.id);
    assert.equal((await inventory.paymentsDue()).find((r) => r.id === order.id)!.balanceDue, 300_000);

    await assert.rejects(inventory.payOrder({ requestId: order.id, amount: 300_001 }), /Only 300000 is left/);
    const part = await inventory.payOrder({ requestId: order.id, amount: 100_000 }); // a part payment
    assert.equal(part.paidAt, undefined);
    assert.equal((await inventory.paymentsDue()).find((r) => r.id === order.id)!.balanceDue, 200_000);
    const full = await inventory.payOrder({ requestId: order.id });
    assert.equal(full.amountPaid, 500_000);
    assert.equal(full.paidAt, today());
    assert.equal((await summary()).balance, start - 500_000); // the project paid exactly the order amount in total
  });

  it("cancelling an order that had an advance keeps the debit and says so", async () => {
    const order = await inventory.orderDirect({ projectId: "p3", materialId: "m4", quantity: 1000, vendor: "Brick Kiln", totalAmount: 90_000, paymentTerms: "advance", advanceAmount: 30_000 });
    const cancelled = await inventory.rejectRequest({ requestId: order.id, note: "Vendor delayed" });
    assert.match(cancelled.decisionNote!, /Vendor delayed\. Advance of 30000 was already paid to Brick Kiln/);
    const entry = (await accounts.list("p3")).find((e) => e.type === "debit" && e.amount === 30_000);
    assert.ok(entry); // the advance is still in the accounts
  });

  it("adds a material to the list once", async () => {
    const sand = await inventory.addMaterial({ name: "Sand", category: "structure", unit: "ton" });
    assert.equal((await inventory.listMaterials()).some((m) => m.id === sand.id), true);
    await assert.rejects(inventory.addMaterial({ name: "sand", category: "structure", unit: "ton" }), /already in the material list/);
    await assert.rejects(inventory.addMaterial({ name: "", category: "structure", unit: "ton" }), ZodError);
    // it can be requested and ordered straight away
    const order = await inventory.orderDirect({ ...ORDER, projectId: "p1", materialId: sand.id, quantity: 5 });
    assert.equal((await inventory.receive(order.id)).status, "fulfilled");
  });

  it("recording usage reduces stock and increases used", async () => {
    const before = (await inventory.projectStock("p1")).find((s) => s.materialId === "m1")!;
    await inventory.recordUsage({ projectId: "p1", materialId: "m1", quantity: 10 });
    const after = (await inventory.projectStock("p1")).find((s) => s.materialId === "m1")!;
    assert.equal(after.quantity, before.quantity - 10);
    assert.equal(after.used, before.used + 10);
    await assert.rejects(inventory.recordUsage({ projectId: "p1", materialId: "m1", quantity: 99_999 }), /Not enough stock/);
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
    await sales.recordSale({ category: "general", projectId: "p1", agentId: "ag1", leadId: "l2", unit: "12-01" });
    const lead = (await sales.listLeads()).find((l) => l.id === "l2")!;
    assert.equal(lead.status, "won");
  });

  it("sells a listed high-rise unit at the size and floor defined for it", async () => {
    // p1 unit 11-01 is a general unit on floor 11 of 1,480 sq ft; the general rate is 12,500 per sq ft
    const sale = await sales.recordSale({ category: "general", projectId: "p1", agentId: "ag1", unit: "11-01" });
    assert.equal(sale.floor, "11");
    assert.equal(sale.area, 1480);
    assert.equal(sale.price, 1480 * 12_500);
    assert.equal(sale.listPrice, sale.price);
    // size sent by the browser is ignored; the floor, if sent, must match
    const second = await sales.recordSale({ category: "general", projectId: "p1", agentId: "ag1", unit: "11-02", area: 1, floor: "11", price: 1 });
    assert.equal(second.area, 1480);
    await assert.rejects(sales.recordSale({ category: "general", projectId: "p1", agentId: "ag1", unit: "11-03", floor: "5" }), /is on floor 11/);
  });

  it("only sells units that exist, in their own plot type, once", async () => {
    await assert.rejects(sales.recordSale({ category: "general", projectId: "p1", agentId: "ag1", unit: "Flat X" }), /does not exist/);
    await assert.rejects(sales.recordSale({ category: "commercial", projectId: "p1", agentId: "ag1", unit: "11-04" }), /is a general unit, not commercial/);
    await sales.recordSale({ category: "general", projectId: "p1", agentId: "ag1", unit: "11-05" });
    await assert.rejects(sales.recordSale({ category: "general", projectId: "p1", agentId: "ag2", unit: "11-05" }), /already sold/);
  });

  it("prices a land plot per marla and does not need a floor", async () => {
    const sale = await sales.recordSale({ category: "general", projectId: "p3", agentId: "ag1", unit: "Plot 21", area: 5 });
    assert.equal(sale.price, 5 * 2_500_000);
    assert.equal(sale.floor, undefined);
    await assert.rejects(sales.recordSale({ category: "general", projectId: "p3", agentId: "ag1", unit: "Plot 23" }), /Plot size is required/);
  });

  it("ignores a price sent by the browser and refuses a plot that is already sold", async () => {
    const sale = await sales.recordSale({ category: "general", projectId: "p3", agentId: "ag1", unit: "Plot 22", area: 10, price: 1 });
    assert.equal(sale.price, 25_000_000);
    await assert.rejects(sales.recordSale({ category: "general", projectId: "p3", agentId: "ag2", unit: "plot 22", area: 10 }), /already sold/);
  });

  it("a direct sale has no agent, takes a unit off the project and credits the project accounts", async () => {
    const before = await accounts.summary("p3");
    const soldBefore = (await sales.unitsSold()).get("p3") ?? 0;
    const sale = await sales.recordDirectSale({ category: "general", projectId: "p3", unit: "Plot 40", area: 4, buyer: "Mr Asif", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "asif@example.com" });
    assert.equal(sale.agentId, null);
    assert.equal(sale.leadId, null);
    assert.equal(sale.buyer, "Mr Asif");
    assert.equal(sale.price, 4 * 2_500_000);

    assert.equal((await sales.unitsSold()).get("p3"), soldBefore + 1);
    const after = await accounts.summary("p3");
    assert.equal(after.sales, before.sales + sale.price);
    assert.equal(after.balance, before.balance + sale.price);
    const entry = (await accounts.list("p3")).find((e) => e.amount === sale.price && e.type === "sale");
    assert.match(entry!.description, /plot Plot 40/);
    assert.equal(entry!.party, "Mr Asif");
  });

  it("an agent sale also credits the project, and commission ignores direct sales", async () => {
    const before = (await accounts.summary("p1")).sales;
    const sale = await sales.recordSale({ category: "residential", projectId: "p1", agentId: "ag1", unit: "3-01" });
    assert.equal((await accounts.summary("p1")).sales, before + sale.price);
    await sales.recordDirectSale({ category: "residential", projectId: "p1", unit: "3-02", buyer: "Mr Asif", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "asif@example.com" });
    const report = await sales.report();
    assert.equal(report.totalSales, report.agents.reduce((n, a) => n + a.sales, 0) + 1);
  });

  it("gives a discount as an amount, a lower rate or a percentage, and credits what the buyer pays", async () => {
    const sell = (unit: string, extra: object) =>
      sales.recordDirectSale({ category: "general", projectId: "p3", unit, area: 10, buyer: "Mr Asif", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "asif@example.com", ...extra });
    // 10 marla x 2,500,000 = 25,000,000
    const plain = await sell("D-0", {});
    assert.equal(plain.listPrice, 25_000_000);
    assert.equal(plain.discountAmount, undefined);

    const amount = await sell("D-1", { discountMode: "amount", discountValue: 10_000 });
    assert.equal(amount.price, 24_990_000);
    assert.equal(amount.listPrice, 25_000_000);
    assert.equal(amount.discountAmount, 10_000);

    const rate = await sell("D-2", { discountMode: "rate", discountValue: 2_400_000 });
    assert.equal(rate.price, 24_000_000);
    assert.equal(rate.discountAmount, 1_000_000);

    const percent = await sell("D-3", { discountMode: "percent", discountValue: 10 });
    assert.equal(percent.price, 22_500_000);
    assert.equal(percent.discountMode, "percent");
    assert.equal(percent.discountValue, 10);

    // the project is credited with what was paid, not the list price
    const credited = (await accounts.list("p3")).filter((e) => e.type === "sale" && /discount/.test(e.description)).map((e) => e.amount);
    assert.deepEqual(credited.sort(), [22_500_000, 24_000_000, 24_990_000]);

    await assert.rejects(sell("D-4", { discountMode: "amount", discountValue: 25_000_000 }), /less than the total/);
    await assert.rejects(sell("D-5", { discountMode: "rate", discountValue: 2_500_000 }), /lower than the list rate/);
    await assert.rejects(sell("D-6", { discountMode: "percent", discountValue: 100 }), /below 100/);
    await assert.rejects(sell("D-7", { discountMode: "percent" }), /Enter the discount/);
  });

  it("an agent sale cannot carry a discount", async () => {
    const sale = await sales.recordSale({ category: "general", projectId: "p3", agentId: "ag1", unit: "Plot 70", area: 10, discountMode: "percent", discountValue: 50 });
    assert.equal(sale.price, 25_000_000);
    assert.equal(sale.discountMode, undefined);
  });

  it("stops selling when every unit is sold", async () => {
    const project = (await projects.findById("p3"))!;
    await projectService.update("p3", { ...project, totalUnits: undefined, rates: [{ category: "general", rate: 2_500_000, units: 1 }] });
    await sales.recordDirectSale({ category: "general", projectId: "p3", unit: "Only plot", area: 1, buyer: "Mr Asif", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "asif@example.com" });
    await assert.rejects(sales.recordDirectSale({ category: "general", projectId: "p3", unit: "Another plot", area: 1, buyer: "Mr Asif", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "asif@example.com" }), /are sold|no units left/);
    await assert.rejects(sales.recordSale({ category: "general", projectId: "p3", agentId: "ag1", unit: "Another plot", area: 1 }), /are sold|no units left/);
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

    await changes.decide({ requestId: request.id, decision: "approved", ...ORDER });
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
    await changes.decide({ requestId: edit.id, decision: "approved", ...ORDER });
    assert.equal((await hr.getWorker("w3")).dailyWage, 3200);

    const removal = await changes.submit({ kind: "worker", action: "remove", targetId: "w3" });
    await changes.decide({ requestId: removal.id, decision: "approved", ...ORDER });
    await assert.rejects(hr.getWorker("w3"), /not found/);
  });

  it("blocks a second pending change for the same person and invalid payloads", async () => {
    await changes.submit({ kind: "agent", action: "remove", targetId: "ag3" });
    await assert.rejects(changes.submit({ kind: "agent", action: "edit", targetId: "ag3", payload: { name: "X", commissionRate: 3 } }), /already waiting/);
    await assert.rejects(changes.submit({ kind: "worker", action: "add", projectId: "p1", payload: { name: "", type: "labour", role: "x" } }), ZodError);
  });

  it("removing an agent keeps past sales but hides them from new work", async () => {
    const request = await changes.submit({ kind: "agent", action: "remove", targetId: "ag1" });
    await changes.decide({ requestId: request.id, decision: "approved", ...ORDER });
    assert.equal((await sales.getAgent("ag1")).active, false);
    assert.ok((await sales.report()).agents.some((a) => a.agentId === "ag1")); // has sales, commission still owed
    await assert.rejects(changes.decide({ requestId: request.id, decision: "approved", ...ORDER }), /already decided/);
  });
});

describe("projects and managers", () => {
  const details = { name: "Lake View", location: "Lahore", type: "land-plotting", rates: [{ category: "general", rate: 3_000_000, units: 40 }], status: "planning", startDate: "2026-11-01", totalUnits: 40, budget: 90_000_000 };

  it("creates a project with a new manager assigned", async () => {
    const manager = await projectService.createManager({ name: "Kashif Raza", phone: "0300-5550000" });
    const project = await projectService.create({ ...details, managerId: manager.id });
    assert.equal(project.slug, "lake-view");
    assert.equal(project.adminName, "Kashif Raza");
    assert.equal(project.order, (await projectService.list()).length);
    assert.equal((await projectService.listManagers()).find((m) => m.id === manager.id)?.projectName, "Lake View");
  });

  it("makes unique slugs and allows a project without a manager", async () => {
    const first = await projectService.create(details);
    const second = await projectService.create(details);
    assert.equal(first.adminName, "Unassigned");
    assert.notEqual(first.slug, second.slug);
  });

  it("edits project details but keeps the URL slug", async () => {
    const updated = await projectService.update("p1", { ...(await projects.findById("p1")), name: "Green Valley Phase 2", budget: 500_000_000, managerId: "mgr_p1" });
    assert.equal(updated.name, "Green Valley Phase 2");
    assert.equal(updated.slug, "green-valley");
    assert.equal(updated.budget, 500_000_000);
  });

  it("replaces the manager of a project, and one manager cannot run two projects", async () => {
    const replacement = await projectService.createManager({ name: "Replacement" });
    const moved = await projectService.update("p1", { ...(await projects.findById("p1")), managerId: replacement.id });
    assert.equal(moved.adminName, "Replacement");
    await assert.rejects(
      projectService.update("p2", { ...(await projects.findById("p2")), managerId: replacement.id }),
      /already manages/,
    );
    // the old manager is free again
    const freed = (await projectService.listManagers()).find((m) => m.id === "mgr_p1");
    assert.equal(freed?.projectId, null);
  });

  it("renames a manager everywhere and blocks deactivating one who runs a project", async () => {
    await projectService.updateManager("mgr_p2", { name: "Sana M. Malik", phone: "", email: "", active: "true" });
    assert.equal((await projects.findById("p2"))?.adminName, "Sana M. Malik");
    await assert.rejects(projectService.updateManager("mgr_p2", { name: "Sana M. Malik", active: "false" }), /Assign another manager/);
    await assert.rejects(projectService.update("p3", { ...(await projects.findById("p3")), managerId: "missing" }), /Manager not found/);
  });

  it("rejects invalid project input", async () => {
    await assert.rejects(projectService.create({ ...details, name: "" }), ZodError);
    await assert.rejects(projectService.create({ ...details, budget: -1 }), ZodError);
  });

  it("fixes the project type but lets the prices change, and new sales use the new price", async () => {
    const project = (await projects.findById("p3"))!;
    const updated = await projectService.update("p3", { ...project, type: "high-rise", totalUnits: undefined, rates: [{ category: "general", rate: 3_000_000, units: 200 }] });
    assert.equal(updated.type, "land-plotting");
    assert.deepEqual(updated.rates, [{ category: "general", rate: 3_000_000, units: 200 }]);
    const sale = await sales.recordSale({ category: "general", projectId: "p3", agentId: "ag1", unit: "Plot 1", area: 2 });
    assert.equal(sale.price, 6_000_000);
    await assert.rejects(projectService.create({ ...details, rates: [] }), ZodError);
  });

  it("lists every unit of a high-rise and counts them per plot type", async () => {
    const rates = [{ category: "commercial", rate: 30_000 }, { category: "residential", rate: 18_000 }];
    const units = [
      { category: "commercial", floor: "G", unit: "G-01", area: 500 },
      { category: "commercial", floor: "1", unit: "1-01", area: 650 },
      { category: "residential", floor: "2", unit: "2-01", area: 1100 },
    ];
    const project = await projectService.create({ ...details, type: "high-rise", rates, units, totalUnits: undefined });
    assert.equal(project.totalUnits, 3); // counted from the list
    assert.deepEqual(project.rates.map((r) => [r.category, r.units]), [["commercial", 2], ["residential", 1]]);
    assert.equal(project.units[1].area, 650); // every unit keeps its own size

    await assert.rejects(projectService.create({ ...details, type: "high-rise", rates, units, totalUnits: 9 }), /must equal the number of units listed \(3\)/);
    await assert.rejects(projectService.create({ ...details, type: "high-rise", rates, units: [] }), /Add the units/);
    await assert.rejects(projectService.create({ ...details, type: "high-rise", rates, units: [units[0], { ...units[1], unit: "g-01" }] }), /listed twice/);
    await assert.rejects(
      projectService.create({ ...details, type: "high-rise", rates: [rates[0]], units }),
      /Set a price for the residential units/,
    );
    await assert.rejects(projectService.create({ ...details, rates: [{ category: "general", rate: 1 }, { category: "general", rate: 2 }] }), /only one price/);
    // a plot type with a price but no units is dropped from a high-rise
    const trimmed = await projectService.create({ ...details, type: "high-rise", rates: [...rates, { category: "general", rate: 5 }], units: [units[0]], totalUnits: undefined });
    assert.deepEqual(trimmed.rates.map((r) => r.category), ["commercial"]);
    // land plotting ignores a unit list
    const landRates = [{ category: "commercial", rate: 30_000, units: 15 }, { category: "residential", rate: 18_000, units: 25 }];
    const land = await projectService.create({ ...details, rates: landRates, units, totalUnits: 40 });
    assert.deepEqual(land.units, []);
  });

  it("sells floor by floor and unit by unit, and protects sold units when editing", async () => {
    const project = await projectService.create({
      ...details,
      type: "high-rise",
      rates: [{ category: "commercial", rate: 30_000 }, { category: "residential", rate: 18_000 }],
      units: [
        { category: "commercial", floor: "G", unit: "S-1", area: 400 },
        { category: "commercial", floor: "G", unit: "S-2", area: 450 },
        { category: "residential", floor: "1", unit: "A-1", area: 1000 },
      ],
      totalUnits: undefined,
    });
    const buyer = { buyerPhone: "0300-1234567", buyerCnic: "3520212345671", buyerEmail: "Buyer@Example.com", buyer: "Buyer One" };
    const sell = (extra: object) => sales.recordDirectSale({ projectId: project.id, ...buyer, ...extra });

    const shop = await sell({ category: "commercial", unit: "s-1" });
    assert.equal(shop.unit, "S-1"); // stored as listed
    assert.equal(shop.floor, "G");
    assert.equal(shop.price, 400 * 30_000);
    assert.equal(shop.buyerCnic, "35202-1234567-1"); // tidied up
    assert.equal(shop.buyerEmail, "buyer@example.com");

    const free = (await sales.availableUnits([(await projects.findById(project.id))!])).get(project.id)!;
    assert.deepEqual(free.map((u) => u.unit), ["S-2", "A-1"]);

    // sold units cannot be removed or moved to another plot type
    const base = { ...(await projects.findById(project.id)), totalUnits: undefined };
    await assert.rejects(projectService.update(project.id, { ...base, units: base.units!.filter((u) => u.unit !== "S-1") }), /S-1 is already sold/);
    await assert.rejects(projectService.update(project.id, { ...base, units: base.units!.map((u) => (u.unit === "S-1" ? { ...u, category: "residential" } : u)) }), /S-1 is already sold/);
    // a free unit's size can change, and units can be added
    const edited = await projectService.update(project.id, {
      ...base,
      units: [...base.units!.map((u) => (u.unit === "S-2" ? { ...u, area: 475 } : u)), { category: "residential", floor: "1", unit: "A-2", area: 900 }],
    });
    assert.equal(edited.totalUnits, 4);
    assert.equal(edited.units.find((u) => u.unit === "S-2")!.area, 475);
  });

  it("needs the buyer's name, phone, CNIC and email for a direct sale", async () => {
    const full = { category: "general", projectId: "p3", unit: "Plot 90", area: 1, buyer: "A Buyer", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "a@example.com" };
    for (const bad of [{ buyer: "" }, { buyerPhone: "abc" }, { buyerCnic: "1234" }, { buyerEmail: "not-an-email" }]) {
      await assert.rejects(sales.recordDirectSale({ ...full, ...bad }), ZodError);
    }
    assert.equal((await sales.recordDirectSale(full)).buyerEmail, "a@example.com");
    // an agent sale may leave the buyer details out
    const agentSale = await sales.recordSale({ category: "general", projectId: "p3", agentId: "ag1", unit: "Plot 91", area: 1 });
    assert.equal(agentSale.buyerCnic, undefined);
  });

  it("counts the plots of each type and makes the total their sum", async () => {
    const rates = [
      { category: "commercial", rate: 4_000_000, units: 40 },
      { category: "residential", rate: 2_800_000, units: 100 },
      { category: "general", rate: 2_500_000, units: 60 },
    ];
    const project = await projectService.create({ ...details, rates, totalUnits: undefined });
    assert.equal(project.totalUnits, 200);
    assert.deepEqual(project.rates.map((r) => r.units), [40, 100, 60]);

    await assert.rejects(projectService.create({ ...details, rates, totalUnits: 150 }), /must equal the units of all plot types \(200\)/);
    await assert.rejects(projectService.create({ ...details, rates: [{ category: "commercial", rate: 1 }] , totalUnits: 5 }), /Enter how many/);
    await assert.rejects(
      projectService.create({ ...details, rates: [{ category: "commercial", rate: 1, units: 5 }, { category: "general", rate: 1 }], totalUnits: 5 }),
      /Enter how many/,
    );
    // a high-rise takes its counts from the unit list, not from the numbers typed per type
    const tower = await projectService.create({
      ...details,
      type: "high-rise",
      rates: [{ category: "general", rate: 1, units: 999 }],
      units: [{ category: "general", floor: "1", unit: "1-01", area: 100 }],
      totalUnits: undefined,
    });
    assert.equal(tower.totalUnits, 1);
    assert.equal(tower.rates[0].units, 1);
  });

  it("stops selling a plot type when all its units are sold, and protects sold counts when editing", async () => {
    const project = await projectService.create({
      ...details,
      rates: [{ category: "commercial", rate: 4_000_000, units: 1 }, { category: "residential", rate: 2_000_000, units: 2 }],
      totalUnits: undefined,
    });
    const buyer = { buyer: "B", buyerPhone: "0300-1234567", buyerCnic: "3520212345671", buyerEmail: "b@example.com" };
    const sell = (category: string, unit: string) => sales.recordDirectSale({ projectId: project.id, category, unit, area: 1, ...buyer });

    await sell("commercial", "C-1");
    await assert.rejects(sell("commercial", "C-2"), /All 1 commercial units .* are sold/);
    await sell("residential", "R-1"); // other types are not affected

    const base = { ...project, totalUnits: undefined };
    await assert.rejects(
      projectService.update(project.id, { ...base, rates: [{ category: "commercial", rate: 4_000_000, units: 1 }, { category: "residential", rate: 2_000_000, units: 1 }].slice(0, 1) }),
      /already sold/,
    );
    await projectService.update(project.id, { ...base, rates: [{ category: "commercial", rate: 4_000_000, units: 5 }, { category: "residential", rate: 2_000_000, units: 2 }] });
    await sell("commercial", "C-2");
  });
});
