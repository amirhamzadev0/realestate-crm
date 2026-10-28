import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import type { InstallmentState } from "@/models/finance";
import { categoryLabels } from "@/models/project";
import { formatDate, formatMoney } from "@/utils/format";
import { instalmentName, instalmentOutcome } from "@/utils/ledger";
import { getLedger } from "@/viewmodels/finance.viewmodel";

import { today as todayInBusinessZone } from "@/utils/id";

export const metadata: Metadata = { title: "Ledger" };

const stateTone: Record<InstallmentState, BadgeTone> = { paid: "success", overdue: "danger", "due-today": "warning", promised: "info", upcoming: "neutral" };

/** One buyer's ledger: how the plan is set up and how far it has got, then every instalment, the newest on top. */
export default async function LedgerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ledger = await getLedger(id);
  if (!ledger) notFound();
  const { sale, projectName, items, ordered, summary } = ledger;
  const today = todayInBusinessZone();
  const years = summary.months / 12;
  const received = items.filter((i) => i.paid > 0); // the ledger lists only what has been paid so far; instalments to come are in the Instalments section

  return (
    <>
      <PageHeader
        title={`Ledger: ${sale.buyer ?? "Buyer"}`}
        subtitle={`${projectName} - ${sale.floor ? `floor ${sale.floor}, ` : ""}unit ${sale.unit} - ${categoryLabels[sale.category]}`}
        actions={
          <>
            <Badge tone={sale.status === "booked" ? "warning" : "success"}>{sale.status === "booked" ? "running" : "fully paid"}</Badge>
            <a className="button" href={`/reports/ledger?sale=${sale.id}`}>
              Download
            </a>
            <Link href="/finance/ledgers" className="button button--ghost">
              All ledgers
            </Link>
          </>
        }
      />

      <div className="grid grid--4">
        <StatCard label="Price" value={formatMoney(sale.price)} hint={sale.discountAmount ? `after ${formatMoney(sale.discountAmount)} discount` : undefined} />
        <StatCard label="Down payment" value={formatMoney(summary.downPayment)} hint={`${summary.downPercent}% of the price`} />
        <StatCard label="Received so far" value={formatMoney(summary.received)} tone="positive" />
        <StatCard label="Still owed" value={formatMoney(summary.owed)} tone={summary.owed ? "negative" : "default"} />
      </div>
      <div className="grid grid--4">
        <StatCard label="Bought on" value={formatDate(sale.date)} />
        <StatCard
          label="Plan length"
          value={`${years} ${years === 1 ? "year" : "years"}`}
          hint={`${summary.months} monthly instalments${summary.dueDay ? `, due on the ${summary.dueDay}` : ""}`}
        />
        <StatCard label="Plan ends" value={summary.endDate ? formatDate(summary.endDate) : "On possession"} />
        <StatCard
          label="Instalments paid"
          value={`${summary.paidCount} of ${summary.totalCount}`}
          hint={`${summary.totalCount - summary.paidCount} left`}
          tone={summary.paidCount === summary.totalCount ? "positive" : "default"}
        />
      </div>

      <Card title={`Payments received so far (${received.length}, newest first). Click one to see how it was paid.`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Instalment</th>
                <th>Due</th>
                <th className="num">To pay</th>
                <th className="num">Paid</th>
                <th className="num">Pending</th>
                <th>Last payment</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {received.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/finance/ledgers/${sale.id}/${item.id}`} className="link">
                      {instalmentName(item, ordered)}
                    </Link>
                  </td>
                  <td>{item.dueDate ? formatDate(item.dueDate) : "On possession"}</td>
                  <td className="num">{formatMoney(item.amount)}</td>
                  <td className="num">{formatMoney(item.paid)}</td>
                  <td className="num">{formatMoney(item.remaining)}</td>
                  <td>{item.paidAt ? formatDate(item.paidAt) : "-"}</td>
                  <td>
                    <Badge tone={stateTone[item.state]}>{item.state}</Badge>
                    <div className="muted">{instalmentOutcome(item, today)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {received.length === 0 ? <EmptyState>No payment has been received yet.</EmptyState> : null}
      </Card>
    </>
  );
}
