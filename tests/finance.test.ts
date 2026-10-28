import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { MockAccountRepository } from "@/repositories/mock/account.repository";
import { MockFinanceRepository } from "@/repositories/mock/finance.repository";
import { MockProjectRepository } from "@/repositories/mock/project.repository";
import { MockSalesRepository } from "@/repositories/mock/sales.repository";
import { AccountService } from "@/services/account.service";
import { FinanceService } from "@/services/finance.service";
import { SalesService } from "@/services/sales.service";
import { addDays } from "@/utils/date";
import { today } from "@/utils/id";
import { buildPlan } from "@/utils/installments";
import { instalmentName, instalmentOutcome, ledgerSummary } from "@/utils/ledger";

const projects = new MockProjectRepository();
const salesRepo = new MockSalesRepository();
const financeRepo = new MockFinanceRepository();
const accountRepo = new MockAccountRepository();
const sales = new SalesService(salesRepo, projects, accountRepo, financeRepo);
const finance = new FinanceService(financeRepo, salesRepo, projects, accountRepo);
const accounts = new AccountService(accountRepo, projects);

beforeEach(() => {
  delete (globalThis as Record<string, unknown>).__crm_mock_store__;
});

const buyer = { buyer: "Mr Asif", buyerPhone: "0300-1234567", buyerCnic: "35202-1234567-1", buyerEmail: "asif@example.com" };
const plan = { downPaymentPercent: 20, months: 12, dueDay: 10 };
const sell = (extra: Record<string, unknown> = {}) =>
  sales.recordDirectSale({ category: "general", projectId: "p3", unit: "Plot 40", area: 4, ...buyer, paymentPlan: plan, ...extra });

describe("payment plan", () => {
  it("works out the example: 1 crore, 20% down, 36 months, half-yearly extra payments and a possession payment", () => {
    const built = buildPlan(10_000_000, { downPaymentPercent: 20, months: 36, dueDay: 10, balloonAmount: 200_000, balloonEveryMonths: 6, possessionAmount: 1_400_000 }, "2026-10-26");
    assert.ok(!("problem" in built));
    assert.equal(built.down, 2_000_000);
    assert.equal(built.monthly, 150_000);
    assert.equal(built.balloons, 6);
    assert.equal(built.items.filter((i) => i.kind === "monthly").length, 36);
    assert.equal(built.items.reduce((sum, i) => sum + i.amount, 0), 10_000_000); // the plan always adds up to the price
    assert.equal(built.items[0].dueDate, "2026-10-26"); // the down payment is due on the sale day
    assert.equal(built.items[1].dueDate, "2026-11-10"); // the first instalment: the chosen day of next month
    assert.equal(built.items.at(-1)?.dueDate, null); // possession has no date
  });

  it("puts the rounding in the last instalment and refuses plans that do not fit", () => {
    const built = buildPlan(1_000_000, { downPaymentPercent: 25, months: 7, dueDay: 28 }, "2026-01-31");
    assert.ok(!("problem" in built));
    assert.equal(built.items.reduce((sum, i) => sum + i.amount, 0), 1_000_000);
    assert.equal(built.items[1].dueDate, "2026-02-28");
    assert.ok("problem" in buildPlan(1_000_000, { downPaymentPercent: 20, months: 12, dueDay: 10, possessionAmount: 900_000 }, "2026-10-26"));
    assert.ok("problem" in buildPlan(1_000_000, { downPaymentPercent: 100, months: 12, dueDay: 10 }, "2026-10-26"));
    assert.ok("problem" in buildPlan(1_000_000, { downPaymentPercent: 20, months: 12, dueDay: 31 }, "2026-10-26"));
  });
});

describe("selling on instalments", () => {
  it("books the unit, credits only the down payment and creates the schedule", async () => {
    const before = (await accounts.summary("p3")).sales;
    const sale = await sell();
    assert.equal(sale.status, "booked");
    assert.equal(sale.paymentType, "installment");
    const items = await financeRepo.list({ saleId: sale.id });
    assert.equal(items.length, 13); // the down payment and 12 months
    assert.equal(items.reduce((sum, i) => sum + i.amount, 0), sale.price);
    assert.equal(items[0].paid, items[0].amount);
    assert.equal((await accounts.summary("p3")).sales - before, items[0].amount); // only the down payment is credited so far
    await assert.rejects(sell(), /already sold/); // a booked unit cannot be sold again
  });

  it("a cash sale is sold at once and has no schedule", async () => {
    const sale = await sell({ paymentPlan: undefined });
    assert.equal(sale.status, undefined);
    assert.equal((await financeRepo.list({ saleId: sale.id })).length, 0);
  });

  it("refuses a plan that does not work", async () => {
    await assert.rejects(sell({ paymentPlan: { ...plan, downPaymentPercent: 100 } }));
    await assert.rejects(sell({ paymentPlan: { ...plan, possessionAmount: 10_000_000_000 } }), /too much/);
  });
});

describe("the finance department", () => {
  it("takes payments in, credits the project, and marks the unit sold when the last instalment is paid", async () => {
    const sale = await sell();
    const items = await finance.list({ saleId: sale.id });
    const before = (await accounts.summary("p3")).sales;

    const first = items.find((i) => i.state !== "paid")!;
    await assert.rejects(finance.receive({ installmentId: first.id, amount: first.amount + 1 }), /left to pay/);
    const part = await finance.receive({ installmentId: first.id, amount: 100 });
    assert.equal(part.remaining, first.amount - 100);
    assert.equal((await accounts.summary("p3")).sales - before, 100);
    assert.equal((await salesRepo.listSales()).find((s) => s.id === sale.id)?.status, "booked");

    for (const item of await finance.list({ saleId: sale.id })) if (item.remaining > 0) await finance.receive({ installmentId: item.id });
    assert.equal((await salesRepo.listSales()).find((s) => s.id === sale.id)?.status, undefined); // sold
    assert.equal((await accounts.summary("p3")).sales - before, sale.price - items[0].amount); // the project got the whole price
    await assert.rejects(finance.receive({ installmentId: first.id }), /already paid/);
  });

  it("flags instalments that are due, and a follow-up moves them off the list until the promised day", async () => {
    const sale = await sell();
    assert.equal((await finance.attention()).length, 0); // nothing is due yet
    const [, second] = await financeRepo.list({ saleId: sale.id });
    await financeRepo.saveAll([{ ...second, dueDate: addDays(today(), -4) }]);

    const [due] = await finance.attention();
    assert.equal(due.id, second.id);
    assert.equal(due.state, "overdue");
    assert.equal((await finance.summary()).overdue.count, 1);

    await assert.rejects(finance.logContact({ installmentId: second.id, channel: "call", followUpOn: addDays(today(), -1) }), /past/);
    const asked = await finance.logContact({ installmentId: second.id, channel: "call", comment: "Needs 5 days", followUpOn: addDays(today(), 5) });
    assert.equal(asked.state, "promised");
    assert.equal(asked.contacts.length, 1);
    assert.equal((await finance.attention()).length, 0);

    // five days later the instalment is back on the list
    await financeRepo.saveAll([{ ...(await financeRepo.find(second.id))!, followUpOn: today() }]);
    assert.equal((await finance.attention()).length, 1);

    // a contact without a day brings it back after the default few days
    const noted = await finance.logContact({ installmentId: second.id, channel: "whatsapp" });
    assert.equal(noted.followUpOn, addDays(today(), 3));
    await finance.receive({ installmentId: second.id });
    await assert.rejects(finance.logContact({ installmentId: second.id, channel: "call" }), /already paid/);
  });
});

describe("editing a plan", () => {
  it("a buyer who wants a longer plan: what is still owed is spread over the new months, and what was paid stays", async () => {
    const sale = await sell({ paymentPlan: { ...plan, months: 12, balloonAmount: 50_000, balloonEveryMonths: 6 } });
    const first = (await financeRepo.list({ saleId: sale.id })).filter((i) => i.kind === "monthly");
    await finance.receive({ installmentId: first[0].id });
    await finance.receive({ installmentId: first[1].id, amount: 10 }); // a part payment keeps that instalment as it is

    const before = (await finance.list({ saleId: sale.id })).reduce((sum, i) => sum + i.remaining, 0);
    const result = await finance.editPlan({ saleId: sale.id, months: 24 });
    const items = result!.items;
    assert.equal(items.filter((i) => i.kind === "monthly").length, 24);
    assert.equal(items.reduce((sum, i) => sum + i.amount, 0), sale.price); // the price does not change
    assert.equal(items.reduce((sum, i) => sum + i.remaining, 0), before); // neither does what is still owed
    assert.equal(items.find((i) => i.id === first[0].id)?.paid, first[0].amount); // paid ones are untouched
    assert.equal(items.find((i) => i.id === first[1].id)?.amount, first[1].amount); // so is the part-paid one
    assert.deepEqual(items.map((i) => i.seq), items.map((_, index) => index + 1));
    const dates = items.filter((i) => i.kind !== "booking").map((i) => i.dueDate!);
    assert.deepEqual(dates, [...dates].sort()); // still in date order

    await assert.rejects(finance.editPlan({ saleId: sale.id, months: 2 }), /cannot be shorter than 3/);
    await assert.rejects(finance.editPlan({ saleId: sale.id }), /Change the length/);
    const shorter = await finance.editPlan({ saleId: sale.id, months: 6 });
    assert.equal(shorter!.items.filter((i) => i.kind === "monthly").length, 6);
    assert.equal(shorter!.items.reduce((sum, i) => sum + i.amount, 0), sale.price);
  });

  it("a buyer who wants to pay on another day: unpaid instalments move to it, paid ones stay", async () => {
    const sale = await sell();
    const [, m1] = await financeRepo.list({ saleId: sale.id });
    await finance.receive({ installmentId: m1.id });
    const result = await finance.editPlan({ saleId: sale.id, dueDay: 5 });
    const monthly = result!.items.filter((i) => i.kind === "monthly");
    assert.equal(monthly[0].dueDate, m1.dueDate); // already paid: the date it was due stays
    assert.ok(monthly.slice(1).every((i) => i.dueDate!.endsWith("-05")));
    assert.equal(monthly.length, 12);
  });

  it("one instalment can be moved to another date, only while it is unpaid", async () => {
    const sale = await sell();
    const [, m1] = await financeRepo.list({ saleId: sale.id });
    assert.equal((await finance.reschedule({ installmentId: m1.id, dueDate: "2027-05-05" })).dueDate, "2027-05-05");
    await assert.rejects(finance.reschedule({ installmentId: m1.id, dueDate: "2001-01-01" }), /before the sale/);
    await finance.receive({ installmentId: m1.id });
    await assert.rejects(finance.reschedule({ installmentId: m1.id, dueDate: "2027-06-05" }), /already paid/);
  });

  it("a sale that is fully paid cannot be edited", async () => {
    const sale = await sell();
    for (const item of await finance.list({ saleId: sale.id })) if (item.remaining > 0) await finance.receive({ installmentId: item.id });
    await assert.rejects(finance.editPlan({ saleId: sale.id, months: 24 }), /fully paid/);
  });
});

describe("the ledger", () => {
  it("keeps every payment of an instalment, and summarises the plan", async () => {
    const sale = await sell({ paymentPlan: { ...plan, months: 12 } });
    const items = await finance.list({ saleId: sale.id });
    assert.deepEqual(items[0].payments.map((p) => p.amount), [items[0].amount]); // the down payment on the sale day

    const m1 = items.find((i) => i.kind === "monthly")!;
    await finance.receive({ installmentId: m1.id, amount: 1000 });
    const full = await finance.receive({ installmentId: m1.id });
    assert.deepEqual(full.payments.map((p) => p.amount), [1000, m1.amount - 1000]); // paid in two parts, both kept

    const plan1 = await finance.saleSchedule(sale.id);
    const summary = ledgerSummary(plan1!.sale, plan1!.items);
    assert.equal(summary.months, 12);
    assert.equal(summary.paidCount, 1);
    assert.equal(summary.totalCount, 12);
    assert.equal(summary.downPercent, 20);
    assert.equal(summary.received + summary.owed, sale.price);
    assert.equal(summary.endDate, plan1!.items.filter((i) => i.dueDate).map((i) => i.dueDate!).sort().at(-1));

    assert.equal(instalmentName(full, plan1!.items), "Monthly instalment 1 of 12");
    assert.equal(instalmentName(items[0], plan1!.items), "Down payment");
    assert.equal(instalmentOutcome(full, today()), "Paid on time");
    assert.match(instalmentOutcome({ ...full, state: "overdue", paid: 5, dueDate: addDays(today(), -3) }, today()), /Part paid, 3 days overdue/);
  });
});

