import type { MaterialRequestView } from "@/models/inventory";
import { formatMoney, formatNumber } from "@/utils/format";

export type OrderEventKind = "requested" | "ordered" | "delivered" | "paid" | "rejected";

/** One thing that happened to a request or order, on one day: the unit a month's record is made of. */
export interface OrderEvent {
  date: string; // ISO date
  kind: OrderEventKind;
  request: MaterialRequestView;
  text: string;
  amount?: number; // money paid, for a "paid" event
  quantity?: number; // quantity that arrived, for a "delivered" event
}

const KIND_ORDER: OrderEventKind[] = ["requested", "ordered", "delivered", "paid", "rejected"];
const DIRECT = "Super Admin (ordered directly)";

/**
 * Everything that happened to an order, dated: the project manager's request, the order being placed, each part that
 * arrived, each payment to the vendor (with what is still owed after it), and a rejection. An order spans months, so each
 * event belongs to the month it happened in. Orders saved before parts and payments were recorded are read from their
 * closing dates: one delivery of the whole quantity, one payment of what was paid.
 */
export function orderEvents(r: MaterialRequestView): OrderEvent[] {
  const events: OrderEvent[] = [];
  const unit = r.unit;
  const add = (date: string | undefined, kind: OrderEventKind, text: string, extra: Partial<OrderEvent> = {}) =>
    events.push({ date: date ?? r.createdAt, kind, request: r, text, ...extra });

  if (r.requestedBy !== DIRECT) add(r.createdAt, "requested", `Requested ${formatNumber(r.quantity)} ${unit} (${r.requestedBy})${r.note ? `: ${r.note}` : ""}`);

  if (r.vendor && r.status !== "pending") {
    const terms = r.paymentTerms === "advance" ? "advance, rest on delivery" : "pay on delivery";
    add(r.orderedAt ?? r.decidedAt, "ordered", `Ordered ${formatNumber(r.quantity)} ${unit} from ${r.vendor}${r.totalAmount !== undefined ? ` for ${formatMoney(r.totalAmount)}` : ""} (${terms})`);
  }

  const deliveries = r.deliveries ?? (r.status === "fulfilled" ? [{ date: r.receivedAt ?? r.createdAt, quantity: r.quantity }] : []);
  let received = 0;
  for (const d of deliveries) {
    received += d.quantity;
    const left = Math.max(0, r.quantity - received);
    add(d.date, "delivered", `Received ${formatNumber(d.quantity)} ${unit}; ${formatNumber(received)} of ${formatNumber(r.quantity)} in${left > 0 ? `, ${formatNumber(left)} still to come` : ", the whole order has arrived"}`, { quantity: d.quantity });
  }

  const payments = r.payments ?? ((r.amountPaid ?? 0) > 0 ? [{ date: r.paidAt ?? r.orderedAt ?? r.createdAt, amount: r.amountPaid ?? 0 }] : []);
  let paid = 0;
  for (const p of payments) {
    paid += p.amount;
    const owed = Math.max(0, (r.totalAmount ?? 0) - paid);
    add(p.date, "paid", `Paid ${formatMoney(p.amount)} to ${r.vendor ?? "the vendor"}; ${owed > 0 ? `${formatMoney(owed)} still to pay` : "paid in full"}`, { amount: p.amount });
  }

  if (r.status === "rejected") add(r.decidedAt, "rejected", `${r.orderedAt ? "Cancelled" : "Rejected"}${r.decisionNote ? `: ${r.decisionNote}` : ""}`);

  return events;
}

/** Oldest first, and within one day in the order things happen. */
export const sortEvents = (events: OrderEvent[]) =>
  [...events].sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
