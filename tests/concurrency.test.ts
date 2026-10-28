import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { MockAccountRepository } from "@/repositories/mock/account.repository";
import { MockChangeRequestRepository } from "@/repositories/mock/change-request.repository";
import { MockFinanceRepository } from "@/repositories/mock/finance.repository";
import { MockHrRepository } from "@/repositories/mock/hr.repository";
import { MockInventoryRepository } from "@/repositories/mock/inventory.repository";
import { MockProjectRepository } from "@/repositories/mock/project.repository";
import { MockSalesRepository } from "@/repositories/mock/sales.repository";
import { AccountService } from "@/services/account.service";
import { ChangeRequestService } from "@/services/change-request.service";
import { FinanceService } from "@/services/finance.service";
import { HrService } from "@/services/hr.service";
import { InventoryService } from "@/services/inventory.service";
import { SalesService } from "@/services/sales.service";
import { withLock } from "@/utils/lock";

// The same request arriving several times at once (a button pressed twice, a slow connection resending) must count once.
const projects = new MockProjectRepository();
const salesRepo = new MockSalesRepository();
const financeRepo = new MockFinanceRepository();
const accountRepo = new MockAccountRepository();
const sales = new SalesService(salesRepo, projects, accountRepo, financeRepo);
const finance = new FinanceService(financeRepo, salesRepo, projects, accountRepo);
const inventory = new InventoryService(new MockInventoryRepository(), projects, accountRepo);
const hr = new HrService(new MockHrRepository(), projects);
const changes = new ChangeRequestService(new MockChangeRequestRepository(), projects, hr, sales);
const accounts = new AccountService(accountRepo, projects);

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__crm_mock_store__;
});

const buyer = { buyer: "Mr Asif", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "asif@example.com" };
const SIX = [1, 2, 3, 4, 5, 6];
const outcome = async (calls: Promise<unknown>[]) => {
  const results = await Promise.allSettled(calls);
  return { done: results.filter((r) => r.status === "fulfilled").length, refused: results.filter((r): r is PromiseRejectedResult => r.status === "rejected") };
};

describe("withLock", () => {
  it("runs work on the same key one after the other, in order, and a failure does not block the next", async () => {
    const order: string[] = [];
    const slow = withLock("k", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("first");
      throw new Error("boom");
    });
    const second = withLock("k", async () => void order.push("second"));
    const other = withLock("another", async () => void order.push("other")); // a different key does not wait
    await assert.rejects(slow, /boom/);
    await second;
    await other;
    assert.deepEqual(order, ["other", "first", "second"]);
  });
});

describe("the same request arriving many times at once", () => {
  it("sells a unit once and credits the project once", async () => {
    const before = (await accounts.summary("p3")).sales;
    const { done, refused } = await outcome(SIX.map(() => sales.recordDirectSale({ category: "general", projectId: "p3", unit: "Plot 40", area: 4, ...buyer })));
    assert.equal(done, 1);
    assert.ok(refused.every((r) => /already sold/.test(String(r.reason))));
    const sold = (await salesRepo.listSales()).filter((s) => s.projectId === "p3" && s.unit === "Plot 40");
    assert.equal(sold.length, 1);
    assert.equal((await accounts.summary("p3")).sales - before, sold[0].price);
  });

  it("receives an instalment once", async () => {
    const sale = await sales.recordDirectSale({ category: "general", projectId: "p3", unit: "Plot 41", area: 4, ...buyer, paymentPlan: { downPaymentPercent: 20, months: 4, dueDay: 10 } });
    const first = (await financeRepo.list({ saleId: sale.id })).find((i) => i.kind === "monthly")!;
    const before = (await accounts.summary("p3")).sales;
    const { done } = await outcome(SIX.map(() => finance.receive({ installmentId: first.id })));
    assert.equal(done, 1);
    assert.equal((await accounts.summary("p3")).sales - before, first.amount);
    assert.equal((await financeRepo.find(first.id))?.payments?.length, 1);
  });

  it("changes one sale's instalments one at a time (payments and plan edits together)", async () => {
    const sale = await sales.recordDirectSale({ category: "general", projectId: "p3", unit: "Plot 42", area: 4, ...buyer, paymentPlan: { downPaymentPercent: 20, months: 6, dueDay: 10 } });
    const items = await financeRepo.list({ saleId: sale.id });
    const monthly = items.filter((i) => i.kind === "monthly");
    const before = (await accounts.summary("p3")).sales;
    await Promise.allSettled([
      finance.receive({ installmentId: monthly[0].id, amount: 1000 }),
      finance.receive({ installmentId: monthly[0].id, amount: 1000 }),
      finance.editPlan({ saleId: sale.id, months: 12 }),
      finance.reschedule({ installmentId: monthly[1].id, dueDate: "2027-05-05" }),
    ]);
    const after = await financeRepo.list({ saleId: sale.id });
    assert.equal(after.reduce((sum, i) => sum + i.amount, 0), sale.price); // the plan still adds up to the price
    assert.equal(after.find((i) => i.id === monthly[0].id)?.paid, 2000); // both payments counted, none lost
    assert.equal((await accounts.summary("p3")).sales - before, 2000);
  });

  it("pays a vendor once", async () => {
    const order = await inventory.orderDirect({ projectId: "p1", materialId: "m4", quantity: 10, vendor: "Ali Traders", totalAmount: 1000, paymentTerms: "on-delivery" });
    await inventory.receive({ requestId: order.id });
    const debitBefore = (await accounts.summary("p1")).debit;
    const { done } = await outcome(SIX.map(() => inventory.payOrder({ requestId: order.id })));
    assert.equal(done, 1);
    assert.equal((await accounts.summary("p1")).debit - debitBefore, 1000);
  });

  it("adds a delivery to the stock once, and counts two orders of the same material that arrive together", async () => {
    const stock = async () => (await inventory.projectStock("p1")).find((s) => s.materialId === "m4")?.quantity ?? 0;
    const start = await stock();
    const a = await inventory.orderDirect({ projectId: "p1", materialId: "m4", quantity: 100, vendor: "A", totalAmount: 10 });
    const { done } = await outcome(SIX.map(() => inventory.receive({ requestId: a.id })));
    assert.equal(done, 1);
    assert.equal(await stock(), start + 100);

    const b = await inventory.orderDirect({ projectId: "p1", materialId: "m4", quantity: 7, vendor: "B", totalAmount: 10 });
    const c = await inventory.orderDirect({ projectId: "p1", materialId: "m4", quantity: 5, vendor: "C", totalAmount: 10 });
    await Promise.all([inventory.receive({ requestId: b.id }), inventory.receive({ requestId: c.id }), inventory.recordUsage({ projectId: "p1", materialId: "m4", quantity: 3 })]);
    assert.equal(await stock(), start + 100 + 7 + 5 - 3); // no delivery or use was lost
  });

  it("pays a salary or task once", async () => {
    const worker = await hr.addWorker({ projectId: "p1", name: "Race Mason", type: "labour", role: "Mason", dailyWage: 1000 });
    const task = await hr.assignTask({ projectId: "p1", workerId: worker.id, task: "Wall", dueDate: "2026-12-01", payment: 5000 });
    await hr.setTaskStatus(task.id, "done");
    const { done, refused } = await outcome(SIX.map(() => hr.pay({ projectId: "p1", workerId: worker.id, kind: "task", ref: task.id })));
    assert.equal(done, 1);
    assert.ok(refused.every((r) => /already paid/.test(String(r.reason))));
  });

  it("applies an approved change once", async () => {
    const request = await changes.submit({ kind: "worker", action: "add", projectId: "p1", payload: { name: "Race Worker", type: "labour", role: "Helper", dailyWage: 900 } });
    const before = (await hr.listWorkers("p1")).length;
    const { done } = await outcome(SIX.map(() => changes.decide({ requestId: request.id, decision: "approved" })));
    assert.equal(done, 1);
    assert.equal((await hr.listWorkers("p1")).length, before + 1); // one worker, not six
  });
});
