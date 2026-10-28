import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditPlanForm } from "@/components/finance/EditPlanForm";
import { InstallmentTable } from "@/components/finance/InstallmentTable";
import { Badge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { categoryLabels } from "@/models/project";
import { formatDate, formatMoney } from "@/utils/format";
import { getSalePlan } from "@/viewmodels/finance.viewmodel";

export const metadata: Metadata = { title: "Payment plan" };

/** One unit sold on instalments: the buyer, the price, and every payment of the plan with what was received. */
export default async function SalePlanPage({ params }: { params: Promise<{ id: string }> }) {
  const plan = await getSalePlan((await params).id);
  if (!plan) notFound();
  const { sale, projectName, items } = plan;
  const paid = items.reduce((sum, i) => sum + i.paid, 0);
  const owed = items.reduce((sum, i) => sum + i.remaining, 0);
  const monthly = items.filter((i) => i.kind === "monthly");
  const unpaidMonthly = monthly.filter((i) => i.paid === 0);
  const dueDay = Number((unpaidMonthly[0] ?? monthly.at(-1))?.dueDate?.slice(8, 10) ?? 10);

  return (
    <>
      <PageHeader
        title={`${sale.buyer ?? "Buyer"} - unit ${sale.unit}`}
        subtitle={`${projectName}${sale.floor ? `, floor ${sale.floor}` : ""} - ${categoryLabels[sale.category]} - sold on ${formatDate(sale.date)}`}
        actions={
          <>
            <Badge tone={sale.status === "booked" ? "warning" : "success"}>{sale.status === "booked" ? "booked" : "sold"}</Badge>
            <Link href="/finance/sales" className="button button--ghost">
              All booked units
            </Link>
          </>
        }
      />
      <div className="grid grid--4">
        <StatCard label="Price" value={formatMoney(sale.price)} hint={sale.discountAmount ? `after ${formatMoney(sale.discountAmount)} discount` : undefined} />
        <StatCard label="Received" value={formatMoney(paid)} tone="positive" />
        <StatCard label="Still owed" value={formatMoney(owed)} tone={owed ? "negative" : "default"} />
        <StatCard label="Instalments" value={`${items.filter((i) => i.state === "paid").length} of ${items.length} paid`} />
      </div>
      <Card title="Buyer">
        <dl className="review__facts">
          <div><dt>Name</dt><dd>{sale.buyer ?? "-"}</dd></div>
          <div><dt>Phone</dt><dd>{sale.buyerPhone ?? "-"}</dd></div>
          <div><dt>CNIC</dt><dd>{sale.buyerCnic ?? "-"}</dd></div>
          <div><dt>Email</dt><dd>{sale.buyerEmail ?? "-"}</dd></div>
        </dl>
      </Card>
      {sale.status === "booked" && unpaidMonthly.length > 0 ? (
        <Card title="Change this plan">
          <EditPlanForm
            saleId={sale.id}
            months={monthly.length}
            dueDay={dueDay}
            keptCount={monthly.length - unpaidMonthly.length}
            pool={unpaidMonthly.reduce((sum, i) => sum + i.amount, 0)}
          />
        </Card>
      ) : null}
      <Card title="Payment plan (use Change date on a row to move one instalment)">
        <InstallmentTable items={items} actions showSale={false} />
      </Card>
    </>
  );
}
