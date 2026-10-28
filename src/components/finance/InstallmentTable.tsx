import Link from "next/link";
import { InstallmentActions } from "@/components/finance/InstallmentActions";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageHeader";
import { installmentLabels, type InstallmentState, type InstallmentView } from "@/models/finance";
import { formatDate, formatMoney } from "@/utils/format";

const stateTone: Record<InstallmentState, BadgeTone> = {
  paid: "success",
  overdue: "danger",
  "due-today": "warning",
  promised: "info",
  upcoming: "neutral",
};

/** How many days past the due date, for the overdue ones. */
function lateBy(dueDate: string | null): string {
  if (!dueDate) return "";
  const days = Math.round((Date.now() - new Date(`${dueDate}T00:00:00Z`).getTime()) / 86_400_000);
  return days > 0 ? `${days} ${days === 1 ? "day" : "days"} late` : "";
}

/**
 * Instalments with who owes them, when, how much is still owed and the last follow-up. With `actions` each row has the
 * Finance manager's controls to receive the payment and to follow the buyer up.
 */
export function InstallmentTable({
  items,
  actions = false,
  highlight = false,
  showSale = true,
}: {
  items: InstallmentView[];
  actions?: boolean;
  /** Mark the rows that need a follow-up (used when opened from the notification bell). */
  highlight?: boolean;
  /** Show who the buyer and unit are (off on the page of one sale). */
  showSale?: boolean;
}) {
  if (items.length === 0) return <EmptyState>Nothing here.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Due</th>
            {showSale ? <th>Buyer and unit</th> : null}
            <th>Payment</th>
            <th className="num">Amount</th>
            <th className="num">Still owed</th>
            <th>Status</th>
            <th>Follow-up</th>
            {actions ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const last = item.contacts.at(-1);
            return (
              <tr key={item.id} className={highlight && item.needsFollowUp ? "lead-row--highlight" : undefined}>
                <td>
                  {item.dueDate ? formatDate(item.dueDate) : "On possession"}
                  {item.state === "overdue" ? <div className="follow-up__due">{lateBy(item.dueDate)}</div> : null}
                </td>
                {showSale ? (
                  <td>
                    <Link href={`/finance/sales/${item.saleId}`} className="link">
                      {item.buyer || "Buyer"}
                    </Link>
                    <div className="muted">
                      {item.projectName} - {item.floor ? `Floor ${item.floor}, ` : ""}unit {item.unit}
                    </div>
                    {item.buyerPhone ? <div className="muted">{item.buyerPhone}</div> : null}
                  </td>
                ) : null}
                <td>
                  {installmentLabels[item.kind]}
                  {item.kind !== "booking" ? ` #${item.seq - 1}` : ""}
                </td>
                <td className="num">{formatMoney(item.amount)}</td>
                <td className="num">{formatMoney(item.remaining)}</td>
                <td>
                  <Badge tone={stateTone[item.state]}>{item.state}</Badge>
                  {item.state === "promised" && item.followUpOn ? <div className="muted">Asked for time until {formatDate(item.followUpOn)}</div> : null}
                </td>
                <td>
                  {last ? (
                    <>
                      <div>
                        {last.channel === "call" ? "Called" : last.channel === "whatsapp" ? "WhatsApp" : "Note"} {formatDate(last.at.slice(0, 10))}
                      </div>
                      {last.comment ? <div className="contact-comment">&ldquo;{last.comment}&rdquo;</div> : null}
                    </>
                  ) : item.needsFollowUp ? (
                    <span className="follow-up__due">Not followed up yet</span>
                  ) : (
                    <span className="muted">-</span>
                  )}
                  {item.followUpOn && item.state !== "paid" && item.state !== "promised" ? <div className="muted">Follow-up day {formatDate(item.followUpOn)}</div> : null}
                  {item.contacts.length > 1 ? (
                    <details className="contact-history">
                      <summary>History ({item.contacts.length})</summary>
                      <ul>
                        {item.contacts.map((c, index) => (
                          <li key={index}>
                            <strong>{c.channel === "call" ? "Call" : c.channel === "whatsapp" ? "WhatsApp" : "Note"}</strong> - {formatDate(c.at.slice(0, 10))}
                            {c.comment ? <div className="contact-comment">&ldquo;{c.comment}&rdquo;</div> : null}
                            {c.followUpOn ? <div className="muted">Follow up: {formatDate(c.followUpOn)}</div> : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </td>
                {actions ? (
                  <td>
                    <InstallmentActions item={item} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
