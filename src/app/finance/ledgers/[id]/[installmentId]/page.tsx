import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { formatDate, formatMoney } from "@/utils/format";
import { instalmentName, instalmentOutcome } from "@/utils/ledger";
import { getLedger } from "@/viewmodels/finance.viewmodel";

import { today as todayInBusinessZone } from "@/utils/id";

export const metadata: Metadata = { title: "Instalment" };

/** One instalment of a ledger in detail: what was due, what was paid and when, and every call or message about it. */
export default async function LedgerInstalmentPage({ params }: { params: Promise<{ id: string; installmentId: string }> }) {
  const { id, installmentId } = await params;
  const ledger = await getLedger(id);
  const item = ledger?.items.find((i) => i.id === installmentId);
  if (!ledger || !item) notFound();
  const { sale, ordered } = ledger;
  const name = instalmentName(item, ordered);
  const today = todayInBusinessZone();

  return (
    <>
      <PageHeader
        title={name}
        subtitle={`${sale.buyer ?? "Buyer"} - ${ledger.projectName}, unit ${sale.unit}`}
        actions={
          <Link href={`/finance/ledgers/${sale.id}`} className="button button--ghost">
            Back to the ledger
          </Link>
        }
      />
      <div className="grid grid--4">
        <StatCard label="Due on" value={item.dueDate ? formatDate(item.dueDate) : "On possession"} />
        <StatCard label="Amount to pay" value={formatMoney(item.amount)} />
        <StatCard label="Paid" value={formatMoney(item.paid)} tone="positive" />
        <StatCard label="Pending" value={formatMoney(item.remaining)} tone={item.remaining ? "negative" : "default"} />
      </div>
      <p>
        <Badge tone={item.state === "paid" ? "success" : item.state === "overdue" ? "danger" : "neutral"}>{item.state}</Badge> {instalmentOutcome(item, today)}
        {item.followUpOn && item.state !== "paid" ? ` - follow-up day ${formatDate(item.followUpOn)}` : ""}
      </p>

      <Card title={`Payments received (${item.payments.length})`}>
        {item.payments.length === 0 ? (
          <EmptyState>Nothing has been paid on this instalment yet.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Amount</th>
                  <th className="num">Paid so far</th>
                  <th className="num">Still pending</th>
                  <th>Compared with the due date</th>
                </tr>
              </thead>
              <tbody>
                {item.payments.map((payment, index) => {
                  const sofar = item.payments.slice(0, index + 1).reduce((sum, p) => sum + p.amount, 0);
                  const days = item.dueDate ? Math.round((new Date(`${payment.date}T00:00:00Z`).getTime() - new Date(`${item.dueDate}T00:00:00Z`).getTime()) / 86_400_000) : 0;
                  return (
                    <tr key={index}>
                      <td>{formatDate(payment.date)}</td>
                      <td className="num">{formatMoney(payment.amount)}</td>
                      <td className="num">{formatMoney(sofar)}</td>
                      <td className="num">{formatMoney(Math.max(0, item.amount - sofar))}</td>
                      <td>{!item.dueDate ? "-" : days > 0 ? `${days} ${days === 1 ? "day" : "days"} late` : days < 0 ? `${-days} ${days === -1 ? "day" : "days"} early` : "On the due date"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Follow-ups (${item.contacts.length})`}>
        {item.contacts.length === 0 ? (
          <EmptyState>Nobody has contacted the buyer about this instalment.</EmptyState>
        ) : (
          <ul className="manager-list">
            {[...item.contacts].reverse().map((c, index) => (
              <li key={index} className="manager-list__item">
                <strong>{c.channel === "call" ? "Phone call" : c.channel === "whatsapp" ? "WhatsApp" : "Note"}</strong> - {formatDate(c.at.slice(0, 10))}
                {c.comment ? <div className="contact-comment">&ldquo;{c.comment}&rdquo;</div> : null}
                {c.followUpOn ? <div className="muted">Follow up again on {formatDate(c.followUpOn)}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
