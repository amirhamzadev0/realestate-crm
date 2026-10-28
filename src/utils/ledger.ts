import { installmentLabels, type InstallmentView } from "@/models/finance";
import type { Sale } from "@/models/sales";

/** The headline numbers of one buyer's payment plan, for the top of the ledger. */
export interface LedgerSummary {
  downPayment: number;
  downPercent: number; // of the price
  months: number; // monthly instalments in the plan
  dueDay: number | null; // the day of the month the instalments fall due
  endDate: string | null; // the last due date; null when only a possession payment has no date
  paidCount: number; // instalments paid in full (the down payment is not counted)
  totalCount: number; // instalments in all (the down payment is not counted)
  received: number;
  owed: number;
}

export function ledgerSummary(sale: Pick<Sale, "price">, items: InstallmentView[]): LedgerSummary {
  const booking = items.find((i) => i.kind === "booking");
  const rest = items.filter((i) => i.kind !== "booking");
  const dates = items.map((i) => i.dueDate).filter((d): d is string => d !== null).sort();
  const monthly = items.filter((i) => i.kind === "monthly");
  return {
    downPayment: booking?.amount ?? 0,
    downPercent: sale.price > 0 ? Math.round(((booking?.amount ?? 0) / sale.price) * 1000) / 10 : 0,
    months: monthly.length,
    dueDay: monthly[0]?.dueDate ? Number(monthly[0].dueDate.slice(8, 10)) : null,
    endDate: dates.at(-1) ?? null,
    paidCount: rest.filter((i) => i.state === "paid").length,
    totalCount: rest.length,
    received: items.reduce((sum, i) => sum + i.paid, 0),
    owed: items.reduce((sum, i) => sum + i.remaining, 0),
  };
}

/** "Monthly instalment 5 of 36", "Half-yearly payment 2 of 6", "Down payment", "Payment on possession". */
export function instalmentName(item: InstallmentView, items: InstallmentView[]): string {
  if (item.kind === "booking") return installmentLabels.booking;
  if (item.kind === "possession") return "Payment on possession";
  const same = items.filter((i) => i.kind === item.kind).sort((a, b) => a.seq - b.seq);
  const position = same.findIndex((i) => i.id === item.id) + 1;
  return `${item.kind === "monthly" ? "Monthly instalment" : "Half-yearly payment"} ${position} of ${same.length}`;
}

/** How the instalment stands: paid on time, paid late, part paid... */
export function instalmentOutcome(item: InstallmentView, today: string): string {
  if (item.state === "paid") {
    if (item.dueDate && item.paidAt && item.paidAt > item.dueDate) {
      const days = Math.round((new Date(`${item.paidAt}T00:00:00Z`).getTime() - new Date(`${item.dueDate}T00:00:00Z`).getTime()) / 86_400_000);
      return `Paid ${days} ${days === 1 ? "day" : "days"} late`;
    }
    return "Paid on time";
  }
  const partly = item.paid > 0 ? "Part paid, " : "";
  if (item.dueDate && item.dueDate < today) {
    const days = Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${item.dueDate}T00:00:00Z`).getTime()) / 86_400_000);
    return `${partly}${days} ${days === 1 ? "day" : "days"} overdue`;
  }
  return `${partly}${item.dueDate ? "not due yet" : "due on possession"}`;
}
