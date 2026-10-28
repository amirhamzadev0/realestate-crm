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
import { readLeadRows } from "@/utils/lead-import";
import { orderEvents, sortEvents } from "@/utils/order-events";

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
    await assert.rejects(inventory.receive({ requestId: request.id }), /on its way/); // nothing to receive before it is ordered

    const ordered = await inventory.decide({ requestId: request.id, decision: "approved", ...ORDER });
    assert.equal(ordered.status, "ordered");
    assert.equal(ordered.orderedAt, today());
    assert.equal(await siteQty("p2", "m2"), before); // ordered is not delivered: the inventory has not changed yet

    const received = await inventory.receive({ requestId: request.id });
    assert.equal(received.status, "fulfilled");
    assert.equal(received.receivedAt, today());
    assert.equal(await siteQty("p2", "m2"), before + 500);
    await assert.rejects(inventory.receive({ requestId: request.id }), /on its way/); // cannot be received twice
    await assert.rejects(inventory.decide({ requestId: request.id, decision: "rejected" }), /already decided/);
  });

  it("rejecting a request moves nothing and keeps the reason for the project manager", async () => {
    const before = await siteQty("p1", "m2");
    const request = await inventory.createRequest({ projectId: "p1", materialId: "m2", quantity: 10, requestedBy: "Bilal" });
    const rejected = await inventory.decide({ requestId: request.id, decision: "rejected", note: "Budget exceeded" });
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.decisionNote, "Budget exceeded");
    assert.equal(await siteQty("p1", "m2"), before);
    await assert.rejects(inventory.receive({ requestId: request.id }), /on its way/);
  });

  it("the Super Admin can order for a project directly, and it is recorded as an order", async () => {
    const before = await siteQty("p3", "m1"); // no steel on site yet
    const order = await inventory.orderDirect({ ...ORDER, projectId: "p3", materialId: "m1", quantity: 40, note: "Foundation" });
    assert.equal(order.status, "ordered");
    assert.equal(order.requestedBy, "Super Admin (ordered directly)");
    assert.equal((await inventory.listRequests({ projectId: "p3", status: "ordered" })).some((r) => r.id === order.id), true);
    assert.equal(await siteQty("p3", "m1"), before);
    await inventory.receive({ requestId: order.id });
    assert.equal(await siteQty("p3", "m1"), before + 40); // a first delivery creates the stock line
    await assert.rejects(inventory.orderDirect({ ...ORDER, projectId: "nope", materialId: "m1", quantity: 1 }), /Project not found/);
    await assert.rejects(inventory.orderDirect({ ...ORDER, projectId: "p3", materialId: "nope", quantity: 1 }), /Material not found/);
  });

  it("an order can arrive in parts and closes when the last part arrives", async () => {
    const order = await inventory.orderDirect({ ...ORDER, projectId: "p1", materialId: "m4", quantity: 100 });
    const before = await siteQty("p1", "m4");
    const first = await inventory.receive({ requestId: order.id, quantity: 40 });
    assert.equal(first.status, "ordered"); // still on its way
    assert.equal(await siteQty("p1", "m4"), before + 40);
    const view = (await inventory.listRequests({ projectId: "p1" })).find((r) => r.id === order.id)!;
    assert.equal(view.receivedQuantity, 40);
    assert.equal(view.remainingQuantity, 60);
    await assert.rejects(inventory.receive({ requestId: order.id, quantity: 61 }), /Only 60 is still to come/);
    await assert.rejects(inventory.receive({ requestId: order.id, quantity: 0 }));
    const second = await inventory.receive({ requestId: order.id, quantity: 25 });
    assert.equal(second.status, "ordered");
    const last = await inventory.receive({ requestId: order.id }); // the rest
    assert.equal(last.status, "fulfilled");
    assert.deepEqual(last.deliveries?.map((d) => d.quantity), [40, 25, 35]);
    assert.equal(await siteQty("p1", "m4"), before + 100);
  });

  it("an order shows in the month it was placed and again in the months it was delivered and paid", async () => {
    const order = await inventory.orderDirect({ ...ORDER, projectId: "p1", materialId: "m4", quantity: 10, orderDate: "2026-09-29", paymentTerms: "advance", advanceAmount: 100 });
    await inventory.receive({ requestId: order.id });
    await inventory.payOrder({ requestId: order.id });
    const view = (await inventory.listRequests({ projectId: "p1" })).find((r) => r.id === order.id)!;
    const events = sortEvents(orderEvents(view)).map((e) => `${e.kind}@${e.date.slice(0, 7)}`);
    assert.deepEqual(events, [`ordered@2026-09`, `paid@2026-09`, `delivered@${today().slice(0, 7)}`, `paid@${today().slice(0, 7)}`]);
    assert.match(orderEvents(view).find((e) => e.kind === "paid" && e.date !== "2026-09-29")!.text, /paid in full/);
  });

  it("a delivery is only accepted for the project it belongs to", async () => {
    const order = await inventory.orderDirect({ ...ORDER, projectId: "p1", materialId: "m4", quantity: 1000 });
    await assert.rejects(inventory.receive({ requestId: order.id }, "p2"), /Request not found/); // another project's manager
    assert.equal((await inventory.receive({ requestId: order.id }, "p1")).status, "fulfilled");
  });

  it("the Super Admin can cancel an order that has not arrived, but not one that has", async () => {
    const before = await siteQty("p1", "m5");
    const order = await inventory.orderDirect({ ...ORDER, projectId: "p1", materialId: "m5", quantity: 100 });
    const cancelled = await inventory.rejectRequest({ requestId: order.id });
    assert.equal(cancelled.status, "rejected");
    assert.equal(cancelled.decisionNote, "Order cancelled");
    await assert.rejects(inventory.receive({ requestId: order.id }), /on its way/);

    const delivered = await inventory.orderDirect({ ...ORDER, projectId: "p1", materialId: "m5", quantity: 100 });
    await inventory.receive({ requestId: delivered.id });
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

    await inventory.receive({ requestId: order.id });
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
    await inventory.receive({ requestId: order.id });
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
    assert.equal((await inventory.receive({ requestId: order.id })).status, "fulfilled");
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

  it("the Super Admin creates a sales manager, and the manager creates agents on their team", async () => {
    const manager = await sales.addSalesManager({ name: "Kamran Butt", phone: "0300-1112223", email: "Kamran@Example.com" });
    assert.equal(manager.active, true);
    assert.equal(manager.email, "kamran@example.com");
    const agent = await sales.addAgent({ name: "New Agent", phone: "0300-0000000", commissionRate: 2, managerId: manager.id });
    assert.equal(agent.managerId, manager.id);
    assert.equal((await sales.listAgents()).find((a) => a.id === agent.id)?.active, true);
    await assert.rejects(sales.addAgent({ name: "Ghost", commissionRate: 2, managerId: "nope" }), /Sales manager not found/);
    await assert.rejects(sales.addSalesManager({ name: "" }), ZodError);

    // a manager with active agents cannot be made inactive until the team is moved or removed
    await assert.rejects(sales.updateSalesManager(manager.id, { name: manager.name, active: "false" }), /still has 1 active agents/);
    await sales.removeAgent(agent.id);
    assert.equal((await sales.updateSalesManager(manager.id, { name: "Kamran B.", active: "false" })).active, false);
    await assert.rejects(sales.addAgent({ name: "Late", commissionRate: 2, managerId: manager.id }), /inactive/);
  });

  it("the sales manager can sell himself: credited to the project, no commission", async () => {
    const before = (await accounts.summary("p3")).sales;
    const sale = await sales.recordSale({ category: "general", projectId: "p3", managerId: "sm1", unit: "Plot 80", area: 2 });
    assert.equal(sale.agentId, null);
    assert.equal(sale.soldByManagerId, "sm1");
    assert.equal((await accounts.summary("p3")).sales, before + sale.price);
    const report = await sales.report();
    assert.equal(report.totalSales, report.agents.reduce((n, a) => n + a.sales, 0) + 1); // counted, but on no agent
    await assert.rejects(sales.recordSale({ category: "general", projectId: "p3", unit: "Plot 81", area: 2 }), /Choose who sold it/);
    await assert.rejects(sales.recordSale({ category: "general", projectId: "p3", agentId: "ag1", managerId: "sm1", unit: "Plot 81", area: 2 }), /Choose who sold it/);
    await assert.rejects(sales.recordSale({ category: "general", projectId: "p3", managerId: "nope", unit: "Plot 81", area: 2 }), /Sales manager not found/);
  });

  it("an agent portal shows only that agent's leads and sales, with their commission", async () => {
    const portal = await sales.agentPortal("ag1");
    assert.equal(portal.agent.name, "Hassan Ali");
    assert.equal(portal.manager?.id, "sm1");
    assert.equal(portal.leads.every((l) => l.agentId === "ag1"), true);
    assert.equal(portal.sales.every((s) => s.agentId === "ag1"), true);
    assert.equal(portal.stats.sales, portal.sales.length);
    assert.equal(portal.stats.commission, portal.sales.reduce((sum, s) => sum + Math.round((s.price * 2) / 100), 0));
    await assert.rejects(sales.agentPortal("nope"), /Agent not found/);
    // a sale by someone else does not appear
    const before = (await sales.agentPortal("ag2")).sales.length;
    await sales.recordSale({ category: "general", projectId: "p3", agentId: "ag1", unit: "Plot 90", area: 1 });
    assert.equal((await sales.agentPortal("ag2")).sales.length, before);
    assert.equal((await sales.agentPortal("ag1")).sales.length, portal.sales.length + 1);
  });

  it("keeps the client's email and note on a lead, and forwards it to an agent", async () => {
    const lead = await sales.addLead({ name: "Client One", phone: "0300-1234567", email: "Client@Example.com", note: "Wants a 5 marla plot", projectId: "p3", source: "walk-in" });
    assert.equal(lead.email, "client@example.com");
    assert.equal(lead.note, "Wants a 5 marla plot");
    assert.equal(lead.agentId, null);
    assert.equal(lead.assignedAt, undefined);

    const forwarded = await sales.assignLead({ leadId: lead.id, agentId: "ag2" });
    assert.equal(forwarded.agentId, "ag2");
    assert.equal(forwarded.assignedAt, today());
    assert.equal((await sales.agentPortal("ag2")).leads.some((l) => l.id === lead.id), true); // the agent sees it
    assert.equal((await sales.agentPortal("ag1")).leads.some((l) => l.id === lead.id), false);

    const back = await sales.assignLead({ leadId: lead.id, agentId: null });
    assert.equal(back.agentId, null);
    assert.equal(back.assignedAt, undefined);
    await assert.rejects(sales.assignLead({ leadId: "nope", agentId: "ag1" }), /Lead not found/);
    await assert.rejects(sales.assignLead({ leadId: lead.id, agentId: "nope" }), /Agent not found/);
    await sales.removeAgent("ag3", { leads: "pool" });
    await assert.rejects(sales.assignLead({ leadId: lead.id, agentId: "ag3" }), /no longer an active agent/);
    await assert.rejects(sales.addLead({ name: "X", phone: "0300-1234567", projectId: "p3", source: "walk-in", email: "bad" }), ZodError);
  });

  it("divides the unassigned leads equally among the active agents", async () => {
    const before = await sales.listLeads();
    for (const lead of before.filter((l) => l.agentId === null)) await sales.assignLead({ leadId: lead.id, agentId: "ag1" }); // start with none unassigned
    const made = [];
    for (let i = 0; i < 7; i++) made.push(await sales.addLead({ name: `Lead ${i}`, phone: "0300-1234567", projectId: "p3", source: "facebook" }));

    const load = async () => Object.fromEntries((await sales.listAgents()).map((a) => [a.id, 0]));
    const result = await sales.assignEqually({});
    assert.equal(result.assigned, 7);
    assert.equal(result.perAgent.reduce((n, a) => n + a.count, 0), 7);
    const counts = result.perAgent.map((a) => a.count);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `uneven split ${counts}`); // 3, 2, 2
    for (const lead of made) assert.notEqual((await sales.listLeads()).find((l) => l.id === lead.id)!.agentId, null);
    void load;
    await assert.rejects(sales.assignEqually({}), /no leads to share/);

    // a chosen group of leads among chosen agents only
    const more = [await sales.addLead({ name: "A", phone: "0300-1234567", projectId: "p3", source: "facebook" }), await sales.addLead({ name: "B", phone: "0300-1234567", projectId: "p3", source: "facebook" })];
    const some = await sales.assignEqually({ leadIds: more.map((l) => l.id), agentIds: ["ag1", "ag2"] });
    assert.deepEqual(some.perAgent.map((a) => a.count), [1, 1]);
    await assert.rejects(sales.assignEqually({ leadIds: more.map((l) => l.id), agentIds: ["nope"] }), /no active agent/);
  });

  it("a sales manager can make a direct sale too, with a discount, under their own name", async () => {
    const sale = await sales.recordDirectSale({
      category: "general", projectId: "p3", managerId: "sm1", unit: "Plot M-1", area: 10,
      buyer: "Mr Asif", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "asif@example.com",
      discountMode: "percent", discountValue: 10,
    });
    assert.equal(sale.soldByManagerId, "sm1");
    assert.equal(sale.agentId, null);
    assert.equal(sale.price, 22_500_000);
    assert.equal(sale.buyerCnic, "35202-1234567-1");
    await assert.rejects(
      sales.recordDirectSale({ category: "general", projectId: "p3", managerId: "nope", unit: "Plot M-2", area: 1, buyer: "B", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "b@example.com" }),
      /Sales manager not found/,
    );
  });

  it("counts every call and WhatsApp message an agent starts to a lead's client", async () => {
    const lead = await sales.addLead({ name: "Client Two", phone: "0333-9999999", projectId: "p3", source: "facebook", agentId: "ag1" });
    assert.equal(lead.status, "new");
    const counts = async () => (await sales.agentPortal("ag1")).leads.find((l) => l.id === lead.id)!.contacts;
    assert.deepEqual(await counts(), { calls: 0, whatsapp: 0 });

    await sales.logContact({ leadId: lead.id, channel: "whatsapp" }, "ag1");
    assert.equal((await sales.listLeads()).find((l) => l.id === lead.id)!.status, "contacted"); // the first contact moves it on
    await sales.logContact({ leadId: lead.id, channel: "call" }, "ag1");
    await sales.logContact({ leadId: lead.id, channel: "call" }, "ag1");
    const now = await counts();
    assert.equal(now.calls, 2);
    assert.equal(now.whatsapp, 1);
    assert.ok(now.lastAt && now.lastAt.startsWith(today()));
    assert.equal((await sales.contactSummary()).get(lead.id)?.calls, 2); // the manager sees the same numbers

    // later stages are not pulled back to "contacted"
    await sales.setLeadStatus(lead.id, "negotiation");
    await sales.logContact({ leadId: lead.id, channel: "call" }, "ag1");
    assert.equal((await sales.listLeads()).find((l) => l.id === lead.id)!.status, "negotiation");
  });

  it("an agent cannot contact a lead that is not theirs, and an unforwarded lead has no one to contact it", async () => {
    const lead = await sales.addLead({ name: "Client Three", phone: "0333-8888888", projectId: "p3", source: "facebook", agentId: "ag1" });
    await assert.rejects(sales.logContact({ leadId: lead.id, channel: "call" }, "ag2"), /Lead not found/);
    await sales.logContact({ leadId: lead.id, channel: "call" }); // manager / Super Admin: no restriction
    const loose = await sales.addLead({ name: "Client Four", phone: "0333-7777777", projectId: "p3", source: "facebook" });
    await assert.rejects(sales.logContact({ leadId: loose.id, channel: "call" }), /Forward this lead to an agent/);
    await assert.rejects(sales.logContact({ leadId: "nope", channel: "call" }), /Lead not found/);
    await assert.rejects(sales.logContact({ leadId: lead.id, channel: "sms" }), ZodError);
  });

  it("an agent sells one of their leads like a direct sale: buyer details, discount, commission, lead won", async () => {
    const lead = await sales.addLead({ name: "Client Five", phone: "0333-6666666", email: "five@example.com", projectId: "p3", source: "walk-in", agentId: "ag1" });
    const buyer = { buyer: "Client Five", buyerPhone: "0333-6666666", buyerCnic: "3520212345671", buyerEmail: "five@example.com" };
    const before = (await accounts.summary("p3")).sales;
    const sale = await sales.recordAgentSale(
      { agentId: "ag1", leadId: lead.id, projectId: "p3", category: "general", unit: "Plot A-1", area: 10, discountMode: "percent", discountValue: 10, ...buyer },
      "ag1",
    );
    assert.equal(sale.agentId, "ag1");
    assert.equal(sale.leadId, lead.id);
    assert.equal(sale.price, 22_500_000); // 10 marla x 2,500,000 less 10%
    assert.equal(sale.discountAmount, 2_500_000);
    assert.equal(sale.buyerCnic, "35202-1234567-1");
    assert.equal((await sales.listLeads()).find((l) => l.id === lead.id)!.status, "won");
    assert.equal((await accounts.summary("p3")).sales, before + 22_500_000); // credited to the project

    const portal = await sales.agentPortal("ag1");
    const mine = portal.sales.find((s) => s.id === sale.id)!;
    assert.equal(mine.commission, Math.round((22_500_000 * 2) / 100)); // commission on what the buyer paid
    await assert.rejects(
      sales.recordAgentSale({ agentId: "ag1", leadId: lead.id, projectId: "p3", category: "general", unit: "Plot A-2", area: 1, ...buyer }, "ag1"),
      /already sold/,
    );
  });

  it("an agent can also sell to a client who is not in their leads", async () => {
    const buyer = { buyer: "Walk In", buyerPhone: "0333-3333333", buyerCnic: "3520212345671", buyerEmail: "walk@example.com" };
    const sale = await sales.recordAgentSale({ agentId: "ag2", projectId: "p3", category: "general", unit: "Plot W-1", area: 2, ...buyer }, "ag2");
    assert.equal(sale.agentId, "ag2");
    assert.equal(sale.leadId, null);
    assert.equal(sale.price, 5_000_000);
    assert.equal((await sales.agentPortal("ag2")).sales.some((s) => s.id === sale.id), true); // counted for the agent, with commission
  });

  it("an agent can only sell their own lead, as themselves, with the full buyer details", async () => {
    const lead = await sales.addLead({ name: "Client Six", phone: "0333-5555555", projectId: "p3", source: "walk-in", agentId: "ag1" });
    const buyer = { buyer: "Client Six", buyerPhone: "0333-5555555", buyerCnic: "3520212345671", buyerEmail: "six@example.com" };
    const sell = (extra: object, who?: string) =>
      sales.recordAgentSale({ agentId: "ag1", leadId: lead.id, projectId: "p3", category: "general", unit: "Plot B-1", area: 1, ...buyer, ...extra }, who);

    await assert.rejects(sell({}, "ag2"), /only sell your own leads/); // another agent signed in
    await assert.rejects(sell({ agentId: "ag2" }), /not forwarded to this agent/); // the lead belongs to ag1
    await assert.rejects(sell({ leadId: "nope" }), /Lead not found/);
    await assert.rejects(sell({ buyerCnic: "123" }), ZodError);
    await assert.rejects(sell({ buyerEmail: "" }), ZodError);
    await assert.rejects(sell({ discountMode: "percent", discountValue: 100 }), /below 100/);
    assert.equal((await sales.listLeads()).find((l) => l.id === lead.id)!.status, "new"); // nothing happened to the lead
    assert.equal((await sell({}, "ag1")).agentId, "ag1");

    const loose = await sales.addLead({ name: "Client Seven", phone: "0333-4444444", projectId: "p3", source: "walk-in" });
    await assert.rejects(
      sales.recordAgentSale({ agentId: "ag1", leadId: loose.id, projectId: "p3", category: "general", unit: "Plot B-2", area: 1, ...buyer }),
      /not forwarded to this agent/,
    );
  });

  it("marks a sold unit as sold for the sale form, and it cannot be sold again", async () => {
    const project = (await projects.findById("p1"))!;
    const view = async () => (await sales.saleProjects([(await projects.findById("p1"))!]))[0];
    const before = await view();
    assert.equal(before.allUnits.find((u) => u.unit === "5-03")!.sold, false);
    const freeBefore = before.availableUnits.length;

    const sale = await sales.recordSale({ category: "residential", projectId: "p1", agentId: "ag1", unit: "5-03" });
    const after = await view();
    assert.equal(after.allUnits.find((u) => u.unit === "5-03")!.sold, true); // marked sold
    assert.equal(after.allUnits.length, project.units.length); // still listed, not removed
    assert.equal(after.availableUnits.length, freeBefore - 1);
    assert.equal(after.availableUnits.some((u) => u.unit === "5-03"), false);

    await assert.rejects(sales.recordSale({ category: "residential", projectId: "p1", agentId: "ag2", unit: "5-03" }), /already sold/);
    await assert.rejects(sales.recordDirectSale({ category: "residential", projectId: "p1", unit: "5-03", buyer: "B", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "b@example.com" }), /already sold/);
    assert.ok(sale.price > 0);
  });

  it("the overall agent report counts units, value and commission, and adds up to every sale", async () => {
    await sales.recordSale({ category: "general", projectId: "p3", managerId: "sm1", unit: "Plot R-1", area: 1 });
    await sales.recordDirectSale({ category: "general", projectId: "p3", unit: "Plot R-2", area: 1, buyer: "B", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "b@example.com" });
    const rows = await sales.agentReport();
    const hassan = rows.find((r) => r.key === "ag1")!;
    const own = (await sales.listSales()).filter((s) => s.agentId === "ag1");
    assert.equal(hassan.units, own.length);
    assert.equal(hassan.revenue, own.reduce((n, s) => n + s.price, 0));
    assert.equal(hassan.commission, Math.round((hassan.revenue * 2) / 100));
    assert.equal(rows.find((r) => r.kind === "manager")!.units, 1); // the manager's own sale
    assert.equal(rows.find((r) => r.kind === "direct")!.units, 1);
    assert.equal(rows.find((r) => r.kind === "manager")!.commission, 0);
    assert.equal(rows.reduce((n, r) => n + r.units, 0), (await sales.listSales()).length); // nothing is missing or counted twice
  });

  it("a monthly report covers only that month's sales, calls and leads", async () => {
    // demo data: ag1 sold on 2026-09-28; ag2 on 2026-10-05; ag3 on 2026-10-09
    const sept = await sales.monthlyReport("2026-09");
    assert.equal(sept.find((r) => r.key === "ag1")!.units, 1);
    assert.equal(sept.find((r) => r.key === "ag2")!.units, 0);
    const oct = await sales.monthlyReport("2026-10");
    assert.equal(oct.find((r) => r.key === "ag2")!.units, 1);
    assert.equal(oct.find((r) => r.key === "ag3")!.units, 1);
    assert.equal(oct.find((r) => r.key === "ag1")!.units, 0);
    assert.equal(sept.find((r) => r.key === "ag1")!.revenue, 18_500_000);
    await assert.rejects(sales.monthlyReport("2026-13"), /must look like/);
    await assert.rejects(sales.monthlyReport("oct"), /must look like/);

    // calls count in the month they were made
    const lead = await sales.addLead({ name: "Caller", phone: "0300-1234567", projectId: "p3", source: "walk-in", agentId: "ag2" });
    await sales.logContact({ leadId: lead.id, channel: "call" });
    await sales.logContact({ leadId: lead.id, channel: "whatsapp" });
    const now = (await sales.monthlyReport(today().slice(0, 7))).find((r) => r.key === "ag2")!;
    assert.equal(now.calls, 1);
    assert.equal(now.whatsapp, 1);
    assert.ok(now.leads >= 1);
  });

  it("saves a report for every finished month and keeps it, and a month still running is saved only when asked", async () => {
    const current = today().slice(0, 7);
    const saved = await sales.savedMonthlyReports();
    const sept = saved.find((r) => r.period === "2026-09")!;
    assert.equal(sept.final, true);
    assert.equal(sept.rows.find((r) => r.key === "ag1")!.units, 1);
    assert.equal(saved.some((r) => r.period === current), false); // not saved on its own

    // what was saved does not change when the sales change later
    await sales.recordSale({ category: "general", projectId: "p3", agentId: "ag1", unit: "Plot R-9", area: 1 });
    const again = (await sales.savedMonthlyReports()).find((r) => r.period === "2026-09")!;
    assert.equal(again.generatedAt, sept.generatedAt);

    const now = await sales.saveMonthlyReport(current);
    assert.equal(now.final, false); // "so far"
    assert.equal(now.rows.find((r) => r.key === "ag1")!.units >= 1, true);
    assert.equal((await sales.savedMonthlyReports()).find((r) => r.period === current)?.final, false);
  });

  it("catches up on every month that passed unopened, so any old month's report can be taken out", async () => {
    // an old sale, as if the reports had not been looked at for a long time
    await new MockSalesRepository().saveSale({
      id: "sl_old", projectId: "p1", agentId: "ag1", leadId: null, category: "general", unit: "Old-1", area: 100, rate: 1000, listPrice: 100_000, price: 100_000, date: "2025-03-10",
    });
    const saved = await sales.savedMonthlyReports();
    const periods = saved.map((r) => r.period).sort();
    const current = today().slice(0, 7);
    assert.equal(periods[0], "2025-03");
    // no month between March 2025 and now is missing, and only the running month is left out
    let expected = "2025-03";
    for (const period of periods) {
      assert.equal(period, expected);
      expected = addMonths(`${expected}-01`, 1).slice(0, 7);
    }
    assert.equal(expected, current);
    assert.equal(saved.every((r) => r.final), true);

    // any of those months can be opened, with each agent's numbers
    const march = saved.find((r) => r.period === "2025-03")!;
    assert.equal(march.rows.find((r) => r.key === "ag1")!.units, 1);
    assert.equal(march.rows.find((r) => r.key === "ag1")!.revenue, 100_000);
    const may = saved.find((r) => r.period === "2025-05")!;
    assert.equal(may.rows.find((r) => r.key === "ag1")!.units, 0); // a month with no sales still has its report
    assert.equal(may.rows.some((r) => r.key === "ag2"), true); // every agent is listed
  });

  it("shows one agent's month in detail: their sales with commission, and the leads forwarded to them", async () => {
    // demo data: ag1 sold Flat 10-04 on 2026-09-28 for 18,500,000 (2% commission); lead l1 was created 2026-09-05
    const detail = await sales.agentMonthDetail("ag1", "2026-09");
    assert.equal(detail.agent.name, "Hassan Ali");
    assert.equal(detail.sales.length, 1);
    assert.equal(detail.sales[0].price, 18_500_000);
    assert.equal(detail.sales[0].commission, 370_000);
    assert.equal(detail.row.units, 1);
    assert.equal(detail.row.revenue, 18_500_000);
    assert.equal(detail.leads.some((l) => l.id === "l1"), true);
    assert.equal((await sales.agentMonthDetail("ag1", "2026-08")).sales.length, 0); // a month with nothing still has its page
    await assert.rejects(sales.agentMonthDetail("nope", "2026-09"), /Agent not found/);
    await assert.rejects(sales.agentMonthDetail("ag1", "2026-9"), /must look like/);
  });

  it("an agent writes what was said on a call and when to follow up, and the nearest follow-up comes first", async () => {
    const lead = (name: string) => sales.addLead({ name, phone: "0300-1234567", projectId: "p3", source: "walk-in", agentId: "ag1" });
    const [a, b, c] = [await lead("Far Client"), await lead("Near Client"), await lead("No Date Client")];
    const contact = async (leadId: string) => sales.logContact({ leadId, channel: "call" }, "ag1");
    const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();

    const far = await sales.saveContactNote({ contactId: (await contact(a.id)).id, comment: "Call me next week", followUpAt: hours(24 * 7) }, "ag1");
    const near = await sales.saveContactNote({ contactId: (await contact(b.id)).id, comment: "Busy now, call at 5", followUpAt: hours(2) }, "ag1");
    const plain = await sales.saveContactNote({ contactId: (await contact(c.id)).id, comment: "Not interested yet" }, "ag1");
    assert.equal(far.comment, "Call me next week");
    assert.equal(plain.followUpAt, undefined); // a note without a follow-up date is fine

    const list = await sales.followUps("ag1");
    assert.deepEqual(list.map((f) => f.leadName), ["Near Client", "Far Client"]); // nearest first, the lead with no date is not in it
    assert.equal(list[0].comment, "Busy now, call at 5");
    assert.equal((await sales.followUps("ag2")).length, 0); // another agent sees none of them

    // the lead list shows the latest note and the next follow-up
    const summary = (await sales.contactSummary()).get(b.id)!;
    assert.equal(summary.lastComment, "Busy now, call at 5");
    assert.equal(summary.nextFollowUpAt, near.followUpAt);
    assert.equal((await sales.agentPortal("ag1")).leads.find((l) => l.id === b.id)!.history.length, 1);
  });

  it("a follow-up must be in the future, belongs to its agent, and ends when it is done or the client is contacted again", async () => {
    const lead = await sales.addLead({ name: "Later Client", phone: "0300-1234567", projectId: "p3", source: "walk-in", agentId: "ag1" });
    const first = await sales.logContact({ leadId: lead.id, channel: "whatsapp" }, "ag1");
    const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();

    await assert.rejects(sales.saveContactNote({ contactId: first.id, followUpAt: hours(-1) }, "ag1"), /still to come/);
    await assert.rejects(sales.saveContactNote({ contactId: first.id, followUpAt: "next friday" }, "ag1"), ZodError);
    await assert.rejects(sales.saveContactNote({ contactId: first.id, comment: "x" }, "ag2"), /Contact not found/);
    await assert.rejects(sales.completeFollowUp(first.id, "ag1"), /no follow-up/);

    await sales.saveContactNote({ contactId: first.id, comment: "Call tomorrow", followUpAt: hours(20) }, "ag1");
    assert.equal((await sales.followUps("ag1")).some((f) => f.contactId === first.id), true);
    await assert.rejects(sales.completeFollowUp(first.id, "ag2"), /Contact not found/);

    // contacting the client again counts as following up
    await sales.logContact({ leadId: lead.id, channel: "call" }, "ag1");
    assert.equal((await sales.followUps("ag1")).some((f) => f.contactId === first.id), false);

    // a new promise, then marked done by hand
    const second = await sales.logContact({ leadId: lead.id, channel: "call" }, "ag1");
    await sales.saveContactNote({ contactId: second.id, followUpAt: hours(30) }, "ag1");
    assert.equal((await sales.followUps("ag1")).some((f) => f.contactId === second.id), true);
    await sales.completeFollowUp(second.id, "ag1");
    assert.equal((await sales.followUps("ag1")).some((f) => f.contactId === second.id), false);

    // saving the note again can clear the date
    const third = await sales.logContact({ leadId: lead.id, channel: "call" }, "ag1");
    await sales.saveContactNote({ contactId: third.id, comment: "Booked a visit", followUpAt: hours(5) }, "ag1");
    const cleared = await sales.saveContactNote({ contactId: third.id, comment: "Changed my mind", followUpAt: null }, "ag1");
    assert.equal(cleared.followUpAt, undefined);
    assert.equal(cleared.comment, "Changed my mind");
  });

  it("a lead that is sold no longer shows a follow-up", async () => {
    const lead = await sales.addLead({ name: "Buyer Soon", phone: "0300-1234567", projectId: "p3", source: "walk-in", agentId: "ag1" });
    const contact = await sales.logContact({ leadId: lead.id, channel: "call" }, "ag1");
    await sales.saveContactNote({ contactId: contact.id, followUpAt: new Date(Date.now() + 3_600_000).toISOString() }, "ag1");
    assert.equal((await sales.followUps("ag1")).some((f) => f.leadId === lead.id), true);
    await sales.recordAgentSale(
      { agentId: "ag1", leadId: lead.id, projectId: "p3", category: "general", unit: "Plot F-1", area: 1, buyer: "Buyer Soon", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "b@example.com" },
      "ag1",
    );
    assert.equal((await sales.followUps("ag1")).some((f) => f.leadId === lead.id), false);
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

  it("a manager who runs a project is deleted only after a new manager takes it over", async () => {
    const manager = await projectService.createManager({ name: "Temp Manager" });
    const project = await projectService.create({ ...details, name: "Temp Tower", managerId: manager.id });
    await assert.rejects(projectService.deleteManager(manager.id), /Choose or create a new manager/);
    await assert.rejects(projectService.deleteManager(manager.id, { replacementId: manager.id }), /different manager/);
    assert.ok(await projectService.findById(project.id)); // nothing was changed by the refusals
    assert.equal((await projectService.listManagers()).some((m) => m.id === manager.id), true);

    const spare = await projectService.createManager({ name: "Spare Manager" });
    await projectService.deleteManager(manager.id, { replacementId: spare.id });
    assert.equal((await projectService.findById(project.id))?.adminName, "Spare Manager");
    assert.equal((await projectService.listManagers()).some((m) => m.id === manager.id), false);

    await projectService.deleteManager(spare.id, { replacement: { name: "Fresh Manager", phone: "0300-1" } }); // create and assign in one step
    const after = await projectService.findById(project.id);
    assert.equal(after?.adminName, "Fresh Manager");
    assert.equal((await projectService.listManagers()).find((m) => m.id === after?.managerId)?.phone, "0300-1");
    await assert.rejects(projectService.deleteManager(manager.id), /Manager not found/);
  });

  it("moving a manager to another project needs a new manager for the project they leave", async () => {
    const mover = await projectService.createManager({ name: "Mover" });
    const home = await projectService.create({ ...details, name: "Home Tower", managerId: mover.id });
    const target = await projectService.create({ ...details, name: "Target Tower" });
    const move = { ...target, managerId: mover.id };
    await assert.rejects(projectService.update(target.id, move), /Choose or create a new manager for Home Tower/);
    assert.equal((await projectService.findById(home.id))?.managerId, mover.id); // nothing changed
    await assert.rejects(projectService.update(target.id, { ...move, handover: { replacementId: mover.id } }), /different manager/);

    await projectService.update(target.id, { ...move, handover: { replacement: { name: "Backfill", phone: "0300-2" } } });
    assert.equal((await projectService.findById(target.id))?.adminName, "Mover");
    assert.equal((await projectService.findById(home.id))?.adminName, "Backfill");
  });

  it("a manager with no project can be deleted straight away", async () => {
    const manager = await projectService.createManager({ name: "Idle Manager" });
    await projectService.deleteManager(manager.id);
    assert.equal((await projectService.listManagers()).some((m) => m.id === manager.id), false);
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
      /Choose or create a new manager for Green Valley Residency/,
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

describe("importing leads from a file", () => {
  const csv = [
    "Client Name,Mobile,Project,Source,Notes",
    "Ali Raza,0300-1111111,Green Valley Residency,FB,wants a flat",
    '"Khan, Sana",0300-2222222,skyline-heights,walk in,',
    "Usman,0300-3333333,Royal Gardens,,",
    "Bilal,0300-4444444,Royal Gardens,,",
    "Ali Again,03001111111,Green Valley Residency,,", // same phone as the first row
    ",0300-5555555,Royal Gardens,,", // no name
    "Zara,abc,Royal Gardens,,", // bad phone
    "Omar,0300-6666666,Nowhere Towers,,", // unknown project
  ].join("\r\n");

  it("reads the file whatever the column names and order, and quoted cells", () => {
    const { rows, problem } = readLeadRows(csv);
    assert.equal(problem, undefined);
    assert.equal(rows.length, 8);
    assert.equal(rows[1].name, "Khan, Sana");
    assert.equal(rows[0].line, 2);
    assert.match(readLeadRows("name,phone\nA,1").problem ?? "", /Missing: project/);
    assert.match(readLeadRows("").problem ?? "", /empty/);
  });

  it("imports the good rows, skips and explains the bad ones, and skips duplicates", async () => {
    const before = (await sales.listLeads()).length;
    const result = await sales.importLeads({ defaultSource: "referral", leads: readLeadRows(csv).rows });
    assert.equal(result.imported, 4);
    assert.equal(result.duplicates, 1);
    assert.deepEqual(result.errors.map((e) => e.line), [7, 8, 9]);
    assert.match(result.errors[2].message, /no project called "Nowhere Towers"/);
    assert.deepEqual(result.byProject.map((p) => [p.projectName, p.count]), [["Green Valley Residency", 1], ["Skyline Heights", 1], ["Royal Gardens", 2]]);
    const leads = await sales.listLeads();
    assert.equal(leads.length, before + 4);
    const ali = leads.find((l) => l.name === "Ali Raza")!;
    assert.equal(ali.source, "facebook"); // FB is understood
    assert.equal(ali.agentId, null);
    assert.equal(leads.find((l) => l.name === "Usman")!.source, "referral"); // the default for a row without a source
    assert.equal((await sales.importLeads({ leads: readLeadRows(csv).rows })).imported, 0); // a second upload adds nothing
    await assert.rejects(sales.importLeads({ leads: [] }), /no leads/);
  });

  it("counts one phone written in different ways (Excel drops the leading 0) as one lead", async () => {
    const rows = ["0300-1234501", "+92 300 1234501", "3001234501", "03001234501"].map((phone, n) => ({ line: n + 2, name: `Same Person ${n}`, phone, project: "Royal Gardens" }));
    const result = await sales.importLeads({ leads: rows });
    assert.equal(result.imported, 1);
    assert.equal(result.duplicates, 3);
    assert.equal((await sales.importLeads({ leads: [{ line: 2, name: "Again", phone: "3001234501", project: "Royal Gardens" }] })).duplicates, 1); // also against what is already there
    assert.equal((await sales.importLeads({ leads: [{ line: 2, name: "Other project", phone: "3001234501", project: "Skyline Heights" }] })).imported, 1); // another project is a different lead
  });

  it("gives every lead of a project to one agent, or shares one project's leads equally", async () => {
    await sales.importLeads({ leads: readLeadRows(csv).rows });
    const unassigned = (id: string) => sales.listLeads().then((l) => l.filter((x) => x.projectId === id && x.agentId === null).length);
    const before = await unassigned("p3");
    assert.ok(before >= 2);
    const given = await sales.assignProject({ projectId: "p3", agentId: "ag2" });
    assert.equal(given.assigned, before);
    assert.equal(await unassigned("p3"), 0);
    assert.ok((await sales.listLeads()).filter((l) => l.projectId === "p3" && l.agentId === null).length === 0);
    await assert.rejects(sales.assignProject({ projectId: "p3", agentId: "ag2" }), /no leads to give/);

    const p1Before = await unassigned("p1");
    const shared = await sales.assignEqually({ projectId: "p1", agentIds: ["ag1", "ag3"] });
    assert.equal(shared.assigned, p1Before);
    assert.equal(await unassigned("p1"), 0);
    assert.ok(shared.perAgent.every((a) => Math.abs(a.count - shared.assigned / 2) <= 1));

    const taken = await sales.assignProject({ projectId: "p3", agentId: "ag1", includeAssigned: true }); // takes them from ag2 too
    assert.ok(taken.assigned >= 2);
  });
});

describe("removing an agent who has leads", () => {
  const openOf = async (agentId: string) => (await sales.listLeads()).filter((l) => l.agentId === agentId && l.status !== "won" && l.status !== "lost");

  it("is refused until the agent's open leads are given to someone or put back in not forwarded", async () => {
    const open = (await openOf("ag1")).length;
    assert.ok(open > 0);
    await assert.rejects(sales.removeAgent("ag1"), new RegExp(`has ${open} open leads`));
    assert.equal((await sales.listAgents()).find((a) => a.id === "ag1")?.active, true); // nothing changed
    await assert.rejects(sales.removeAgent("ag1", { leads: "transfer" }), /Choose the agent who takes the leads/);
    await assert.rejects(sales.removeAgent("ag1", { leads: "transfer", toAgentId: "ag1" }), /different agent/);
    await assert.rejects(sales.removeAgent("ag1", { leads: "transfer", toAgentId: "nope" }), /Agent not found/);
  });

  it("gives the open leads to another agent; sold and lost leads stay for the reports", async () => {
    const before = await openOf("ag1");
    const kept = (await sales.listLeads()).filter((l) => l.agentId === "ag1" && (l.status === "won" || l.status === "lost")).length;
    const result = await sales.removeAgent("ag1", { leads: "transfer", toAgentId: "ag2" });
    assert.equal(result.moved, before.length);
    assert.equal((await openOf("ag1")).length, 0);
    const moved = (await sales.listLeads()).filter((l) => before.some((b) => b.id === l.id));
    assert.ok(moved.every((l) => l.agentId === "ag2" && l.assignedAt === today()));
    assert.equal((await sales.listLeads()).filter((l) => l.agentId === "ag1").length, kept);
    assert.equal((await sales.listAgents()).find((a) => a.id === "ag1")?.active, false);
    await assert.rejects(sales.removeAgent("ag3", { leads: "transfer", toAgentId: "ag1" }), /no longer an active agent/); // not to a removed agent
  });

  it("puts the open leads back in not forwarded, and they can be shared again", async () => {
    const before = await openOf("ag1");
    const unassigned = (await sales.listLeads()).filter((l) => l.agentId === null).length;
    await sales.removeAgent("ag1", { leads: "pool" });
    const after = await sales.listLeads();
    assert.equal(after.filter((l) => l.agentId === null).length, unassigned + before.length);
    assert.ok(after.filter((l) => before.some((b) => b.id === l.id)).every((l) => l.agentId === null && l.assignedAt === undefined));
    const shared = await sales.assignEqually({});
    assert.ok(shared.assigned >= before.length);
    assert.ok(shared.perAgent.every((a) => a.agentId !== "ag1")); // a removed agent gets nothing
  });

  it("an agent with no open leads is removed at once, and leads left with a removed agent count as not forwarded", async () => {
    const agent = await sales.addAgent({ name: "Idle Agent", commissionRate: 1, managerId: "sm1" });
    assert.deepEqual(await sales.removeAgent(agent.id), { moved: 0 });

    // an older removal that left leads behind (before this rule): they are shared again like any not forwarded lead
    const stuck = await sales.addAgent({ name: "Stuck Agent", commissionRate: 1, managerId: "sm1" });
    const lead = await sales.addLead({ name: "Stuck Lead", phone: "0300-7778888", projectId: "p1", source: "walk-in", agentId: stuck.id });
    const raw = new MockSalesRepository();
    await raw.saveAgent({ ...stuck, active: false });
    const result = await sales.assignEqually({ leadIds: undefined, agentIds: ["ag2", "ag3"], projectId: "p1" });
    assert.ok((await sales.listLeads()).find((l) => l.id === lead.id)?.agentId !== stuck.id);
    assert.ok(result.assigned >= 1);
  });
});

