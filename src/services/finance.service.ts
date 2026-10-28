import { z } from "zod";
import { installmentLabels, type Installment, type InstallmentState, type InstallmentView } from "@/models/finance";
import type { Sale } from "@/models/sales";
import type { AccountRepository, FinanceRepository, ProjectRepository, SalesRepository } from "@/repositories/contracts";
import { addDays } from "@/utils/date";
import { AppError, notFound } from "@/utils/errors";
import { newId, today } from "@/utils/id";
import { withLock } from "@/utils/lock";
import { dueOn } from "@/utils/installments";

/** When a contact does not say when to follow up again, the instalment comes back after this many days. */
export const DEFAULT_FOLLOW_UP_DAYS = 3;

export const receiveInstallmentSchema = z.object({
  installmentId: z.string().min(1),
  amount: z.number().positive().max(Number.MAX_SAFE_INTEGER).optional(), // defaults to everything still owed on it
});

export const installmentContactSchema = z.object({
  installmentId: z.string().min(1),
  channel: z.enum(["call", "whatsapp", "note"]),
  comment: z.string().trim().max(1000).default(""),
  // The day to follow up again (for example the buyer asked for 5 more days). Left out: a few days from now.
  followUpOn: z.iso.date().optional(),
});

export const editPlanSchema = z.object({
  saleId: z.string().min(1),
  months: z.number().int().min(1).max(360).optional(), // the new length of the whole plan, in months
  dueDay: z.number().int().min(1).max(28).optional(), // the new day of the month the instalments fall due
});

export const rescheduleSchema = z.object({ installmentId: z.string().min(1), dueDate: z.iso.date() });

/** Booking first, the possession payment last, the rest by date (the monthly instalment before an extra payment of the same day). */
const planOrder = (a: Installment, b: Installment) => {
  const rank = (i: Installment) => (i.kind === "booking" ? 0 : i.kind === "possession" ? 3 : i.kind === "monthly" ? 1 : 2);
  return (a.kind === "booking" || a.kind === "possession" || b.kind === "booking" || b.kind === "possession" ? 0 : (a.dueDate ?? "").localeCompare(b.dueDate ?? "")) || rank(a) - rank(b);
};

/**
 * The Finance department: the instalments of units sold on a payment plan. It sees what is due, takes the money in (which is
 * credited to the project's accounts), follows up buyers who have not paid, and when the last instalment of a sale is paid the
 * unit goes from "booked" to "sold".
 */
export class FinanceService {
  constructor(
    private repo: FinanceRepository,
    private sales: SalesRepository,
    private projects: ProjectRepository,
    private accounts: AccountRepository,
  ) {}

  /** Everything that changes one sale's instalments runs one at a time, so a payment pressed twice is counted once. */
  private async underPlanLock<T>(installmentId: string, work: () => Promise<T>): Promise<T> {
    const item = await this.repo.find(installmentId);
    if (!item) throw notFound("Instalment");
    return withLock(`plan:${item.saleId}`, work);
  }

  private stateOf(item: Installment, day: string): { state: InstallmentState; needsFollowUp: boolean } {
    if (item.paid >= item.amount) return { state: "paid", needsFollowUp: false };
    const followUp = item.followUpOn ?? null;
    const needsFollowUp = followUp ? followUp <= day : item.dueDate !== null && item.dueDate <= day;
    if (followUp && followUp > day) return { state: "promised", needsFollowUp };
    if (item.dueDate === null) return { state: "upcoming", needsFollowUp };
    return { state: item.dueDate < day ? "overdue" : item.dueDate === day ? "due-today" : "upcoming", needsFollowUp };
  }

  private async views(items: Installment[]): Promise<InstallmentView[]> {
    const [sales, projects] = await Promise.all([this.sales.listSales(), this.projects.list()]);
    const saleById = new Map(sales.map((s) => [s.id, s]));
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const day = today();
    return items.flatMap((item) => {
      const sale = saleById.get(item.saleId);
      if (!sale) return [];
      return [
        {
          ...item,
          buyer: sale.buyer ?? "",
          buyerPhone: sale.buyerPhone ?? "",
          unit: sale.unit,
          ...(sale.floor ? { floor: sale.floor } : {}),
          projectName: projectName.get(item.projectId) ?? "Unknown",
          payments: item.payments ?? (item.paid > 0 ? [{ date: item.paidAt ?? sale.date, amount: item.paid }] : []),
          remaining: Math.max(0, item.amount - item.paid),
          ...this.stateOf(item, day),
        },
      ];
    });
  }

  /** Every instalment, nearest due date first (the possession payment, which has no date, last). */
  async list(filter?: { projectId?: string; saleId?: string }): Promise<InstallmentView[]> {
    const views = await this.views(await this.repo.list(filter));
    return views.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.seq - b.seq);
  }

  /** The instalments that need a call or a message now: due or overdue, or whose follow-up day has come. Most overdue first. */
  async attention(): Promise<InstallmentView[]> {
    return (await this.list()).filter((i) => i.needsFollowUp);
  }

  /** One sale on instalments: the sale, its project and every instalment in order. */
  async saleSchedule(saleId: string): Promise<{ sale: Sale; projectName: string; items: InstallmentView[] } | null> {
    const sale = (await this.sales.listSales()).find((s) => s.id === saleId);
    if (!sale) return null;
    const items = (await this.views(await this.repo.list({ saleId }))).sort((a, b) => a.seq - b.seq);
    if (items.length === 0) return null;
    return { sale, projectName: items[0].projectName, items };
  }

  /** The numbers for the Finance overview. */
  async summary() {
    const all = await this.list();
    const day = today();
    const week = addDays(day, 7);
    const open = all.filter((i) => i.state !== "paid");
    const sum = (list: InstallmentView[]) => list.reduce((total, i) => total + i.remaining, 0);
    const overdue = open.filter((i) => i.state === "overdue");
    const dueToday = open.filter((i) => i.state === "due-today");
    const nextWeek = open.filter((i) => i.dueDate !== null && i.dueDate > day && i.dueDate <= week);
    const sales = await this.sales.listSales();
    return {
      receivable: sum(open),
      collected: all.reduce((total, i) => total + i.paid, 0),
      overdue: { count: overdue.length, amount: sum(overdue) },
      dueToday: { count: dueToday.length, amount: sum(dueToday) },
      nextWeek: { count: nextWeek.length, amount: sum(nextWeek) },
      bookedUnits: sales.filter((s) => s.status === "booked").length,
      needFollowUp: all.filter((i) => i.needsFollowUp).length,
    };
  }

  /**
   * Changes the plan of a unit that is still booked. A buyer who asks for a longer (or shorter) plan: every instalment that has
   * no payment yet is worked out again, so what is still owed is spread over the new number of months; instalments that were
   * paid (or part paid) stay as they are. A buyer who wants to pay on another day of the month: the instalments that have no
   * payment yet move to that day. The price and what was received do not change.
   */
  async editPlan(input: unknown) {
    const data = editPlanSchema.parse(input);
    return withLock(`plan:${data.saleId}`, () => this.editPlanNow(data));
  }

  private async editPlanNow(data: z.output<typeof editPlanSchema>) {
    const sale = (await this.sales.listSales()).find((s) => s.id === data.saleId);
    if (!sale || sale.paymentType !== "installment") throw notFound("Sale on instalments");
    if (sale.status !== "booked") throw new AppError("This unit is fully paid, so its plan cannot be changed", 409);

    const items = (await this.repo.list({ saleId: sale.id })).sort((a, b) => a.seq - b.seq);
    const monthly = items.filter((i) => i.kind === "monthly");
    const kept = monthly.filter((i) => i.paid > 0);
    const open = monthly.filter((i) => i.paid === 0);
    const currentDay = Number((open[0] ?? kept.at(-1))?.dueDate?.slice(8, 10) ?? 10);
    const months = data.months ?? monthly.length;
    const dueDay = data.dueDay ?? currentDay;
    if (months === monthly.length && dueDay === currentDay) throw new AppError("Change the length of the plan or the due day first", 400);

    const count = months - kept.length;
    if (count < 1) throw new AppError(`${kept.length} monthly instalments already have payments, so the plan cannot be shorter than ${kept.length + 1} months`, 400);
    const pool = open.reduce((sum, i) => sum + i.amount, 0);
    if (open.length === 0) throw new AppError("Every monthly instalment already has a payment, so there is nothing left to spread", 409);
    if (pool < count) throw new AppError("What is still owed is too little for that many months", 400);

    // The unpaid monthly instalments are spread again over the new number of months; the first ones keep their history.
    const each = Math.floor(pool / count);
    const rebuilt: Installment[] = Array.from({ length: count }, (_, j) => ({
      ...(open[j] ?? { id: newId("in"), saleId: sale.id, projectId: sale.projectId, seq: 0, kind: "monthly" as const, paid: 0, contacts: [] }),
      amount: j === count - 1 ? pool - each * (count - 1) : each,
      dueDate: dueOn(sale.date, kept.length + j + 1, dueDay),
    }));
    // Extra payments with nothing paid move to the new day of their month.
    const rest = items
      .filter((i) => i.kind !== "monthly" || i.paid > 0)
      .map((i) => (i.kind === "balloon" && i.paid === 0 && i.dueDate ? { ...i, dueDate: `${i.dueDate.slice(0, 8)}${String(dueDay).padStart(2, "0")}` } : i));
    const ordered = [...rest, ...rebuilt].sort(planOrder).map((item, index) => ({ ...item, seq: index + 1 }));

    await this.repo.removeAll(open.slice(count).map((i) => i.id));
    await this.repo.saveAll(ordered);
    return this.saleSchedule(sale.id);
  }

  /** One instalment is to be paid on another day (the buyer asked for it). */
  async reschedule(input: unknown): Promise<InstallmentView> {
    const data = rescheduleSchema.parse(input);
    return this.underPlanLock(data.installmentId, () => this.rescheduleNow(data));
  }

  private async rescheduleNow(data: z.output<typeof rescheduleSchema>): Promise<InstallmentView> {
    const item = await this.repo.find(data.installmentId);
    if (!item) throw notFound("Instalment");
    if (item.paid >= item.amount) throw new AppError("This instalment is already paid", 409);
    const sale = (await this.sales.listSales()).find((s) => s.id === item.saleId);
    if (sale && data.dueDate < sale.date) throw new AppError("The due date cannot be before the sale", 400);
    const updated: Installment = { ...item, dueDate: data.dueDate };
    await this.repo.saveAll([updated]);
    return (await this.views([updated]))[0];
  }

  /**
   * Money received for an instalment (all that is owed on it, or `amount`). It is credited to the project's accounts. When it was
   * the last unpaid instalment of the sale, the unit becomes "sold".
   */
  async receive(input: unknown): Promise<InstallmentView> {
    const data = receiveInstallmentSchema.parse(input);
    return this.underPlanLock(data.installmentId, () => this.receiveNow(data));
  }

  private async receiveNow(data: z.output<typeof receiveInstallmentSchema>): Promise<InstallmentView> {
    const item = await this.repo.find(data.installmentId);
    if (!item) throw notFound("Instalment");
    const owed = item.amount - item.paid;
    if (owed <= 0) throw new AppError("This instalment is already paid", 409);
    const amount = data.amount ?? owed;
    if (amount > owed) throw new AppError(`Only ${owed} is left to pay on this instalment`, 400);

    const sale = (await this.sales.listSales()).find((s) => s.id === item.saleId);
    if (!sale) throw notFound("Sale");
    const day = today();
    await this.accounts.add({
      id: newId("ac"),
      projectId: item.projectId,
      date: day,
      type: "sale",
      amount,
      description: `${installmentLabels[item.kind]} instalment ${item.seq} for unit ${sale.unit}${amount < owed ? " (part payment)" : ""}`,
      party: sale.buyer ?? "",
    });
    const paid = item.paid + amount;
    const payments = [...(item.payments ?? (item.paid > 0 ? [{ date: item.paidAt ?? sale.date, amount: item.paid }] : [])), { date: day, amount }];
    const updated: Installment = { ...item, paid, paidAt: day, payments, ...(paid >= item.amount ? { followUpOn: null } : {}) };
    await this.repo.saveAll([updated]);

    // The last instalment of the sale has come in: the booked unit is now sold.
    if (paid >= item.amount) {
      const rest = await this.repo.list({ saleId: item.saleId });
      if (rest.every((i) => (i.id === item.id ? paid : i.paid) >= i.amount) && sale.status === "booked") {
        const { status: _booked, ...sold } = sale;
        await this.sales.saveSale(sold);
      }
    }
    return (await this.views([updated]))[0];
  }

  /**
   * The Finance department called or messaged the buyer (or just wrote a note): it is kept with the instalment, and the instalment
   * is marked as followed up until `followUpOn`, the day the buyer asked to be contacted again.
   */
  async logContact(input: unknown): Promise<InstallmentView> {
    const data = installmentContactSchema.parse(input);
    return this.underPlanLock(data.installmentId, () => this.logContactNow(data));
  }

  private async logContactNow(data: z.output<typeof installmentContactSchema>): Promise<InstallmentView> {
    const item = await this.repo.find(data.installmentId);
    if (!item) throw notFound("Instalment");
    if (item.paid >= item.amount) throw new AppError("This instalment is already paid", 409);
    const day = today();
    if (data.followUpOn && data.followUpOn < day) throw new AppError("The follow-up day cannot be in the past", 400);
    const followUpOn = data.followUpOn ?? addDays(day, DEFAULT_FOLLOW_UP_DAYS);
    const updated: Installment = {
      ...item,
      followUpOn,
      contacts: [...item.contacts, { at: new Date().toISOString(), channel: data.channel, comment: data.comment, followUpOn }],
    };
    await this.repo.saveAll([updated]);
    return (await this.views([updated]))[0];
  }
}
