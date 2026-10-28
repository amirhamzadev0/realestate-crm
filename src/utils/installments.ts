import type { InstallmentKind } from "@/models/finance";

/** How a buyer pays for a unit over time: the down payment, then monthly instalments, with optional extra payments. */
export interface PlanInput {
  downPaymentPercent: number; // of the price, paid on the sale day
  months: number; // how many monthly instalments (3 years = 36)
  dueDay: number; // the day of every month the instalment is due (1-28)
  balloonAmount?: number; // an extra payment...
  balloonEveryMonths?: number; // ...every this many months (6 = half-yearly)
  possessionAmount?: number; // paid when the buyer takes possession; no date
}

export interface PlanItem {
  kind: InstallmentKind;
  amount: number;
  dueDate: string | null;
}

export interface BuiltPlan {
  items: PlanItem[];
  down: number;
  monthly: number; // the regular instalment (the last one takes the rounding)
  balloons: number; // how many extra payments
}

/** The date `n` months after the sale, on `day` of that month. */
export function dueOn(saleDate: string, n: number, day: number): string {
  const [year, month] = saleDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + n, day)).toISOString().slice(0, 10);
}

/**
 * Works out every payment of a plan from the price: the down payment on the sale day, then one instalment on the due day of each
 * following month, an extra payment on every balloonEveryMonths-th month, and the possession payment last. The monthly
 * instalment is whatever is left after the other payments, shared equally over the months. Returns a message when it cannot work.
 */
export function buildPlan(price: number, plan: PlanInput, saleDate: string): BuiltPlan | { problem: string } {
  const { downPaymentPercent, months, dueDay } = plan;
  if (!(downPaymentPercent > 0 && downPaymentPercent < 100)) return { problem: "The down payment must be between 0% and 100%" };
  if (!Number.isInteger(months) || months < 1 || months > 360) return { problem: "The plan must be between 1 and 360 months" };
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return { problem: "The due day must be between 1 and 28" };

  const down = Math.round((price * downPaymentPercent) / 100);
  const every = plan.balloonAmount ? (plan.balloonEveryMonths ?? 6) : 0;
  if (plan.balloonAmount && (!Number.isInteger(every) || every < 1)) return { problem: "Enter every how many months the extra payment is due" };
  const balloons = every ? Math.floor(months / every) : 0;
  const possession = plan.possessionAmount ?? 0;
  const balloonTotal = balloons * (plan.balloonAmount ?? 0);

  const remaining = price - down - balloonTotal - possession;
  if (remaining < months) return { problem: "The down payment, extra payments and possession payment are too much for this price" };
  const monthly = Math.floor(remaining / months);

  const items: PlanItem[] = [{ kind: "booking", amount: down, dueDate: saleDate }];
  for (let n = 1; n <= months; n++) {
    const dueDate = dueOn(saleDate, n, dueDay);
    items.push({ kind: "monthly", amount: n === months ? remaining - monthly * (months - 1) : monthly, dueDate });
    if (every && n % every === 0 && plan.balloonAmount) items.push({ kind: "balloon", amount: plan.balloonAmount, dueDate });
  }
  if (possession > 0) items.push({ kind: "possession", amount: possession, dueDate: null });
  return { items, down, monthly, balloons };
}
