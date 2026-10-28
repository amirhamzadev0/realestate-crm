/** booking: the down payment on the sale day. monthly: the regular instalment. balloon: a larger extra payment every few months. possession: the payment when the buyer takes the unit. */
export type InstallmentKind = "booking" | "monthly" | "balloon" | "possession";

export const installmentLabels: Record<InstallmentKind, string> = {
  booking: "Down payment",
  monthly: "Monthly",
  balloon: "Half-yearly",
  possession: "On possession",
};

/** One call, message or note the Finance department made about an instalment. */
export interface InstallmentContact {
  at: string; // ISO date and time
  channel: "call" | "whatsapp" | "note";
  comment: string;
  followUpOn: string | null; // the day to follow up again, when the buyer asked for time
}

/** Money received on an instalment, on one day. */
export interface InstallmentPayment {
  date: string; // ISO date
  amount: number;
}

/** One payment the buyer owes for a sale on instalments. */
export interface Installment {
  id: string;
  saleId: string;
  projectId: string;
  seq: number; // position in the plan, from 1
  kind: InstallmentKind;
  amount: number;
  dueDate: string | null; // ISO date; null when it falls due on possession
  paid: number; // received so far (can be part of the amount)
  paidAt?: string; // ISO date of the latest payment
  payments?: InstallmentPayment[]; // every payment received on it, oldest first
  followUpOn?: string | null; // follow up again on this day; until then it is not shown as needing attention
  contacts: InstallmentContact[];
}

/**
 * paid      - received in full
 * overdue   - the due date has passed
 * due-today - due today
 * promised  - the buyer asked for time; wait until the follow-up day
 * upcoming  - not due yet
 */
export type InstallmentState = "paid" | "overdue" | "due-today" | "promised" | "upcoming";

/** An instalment together with what the Finance screens need to show about its sale. */
export interface InstallmentView extends Installment {
  payments: InstallmentPayment[]; // always filled: older instalments are read from what was paid
  buyer: string;
  buyerPhone: string;
  unit: string;
  floor?: string;
  projectName: string;
  remaining: number;
  state: InstallmentState;
  needsFollowUp: boolean; // due (or its follow-up day has come) and not fully paid
}
