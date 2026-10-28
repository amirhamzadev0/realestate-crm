import type { Metadata } from "next";
import Link from "next/link";
import { InstallmentTable } from "@/components/finance/InstallmentTable";
import { Card, StatCard } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatCompactMoney } from "@/utils/format";
import { getFinanceOverview } from "@/viewmodels/finance.viewmodel";

export const metadata: Metadata = { title: "Finance" };

/** The Finance department: what is owed on units sold on instalments, and the buyers who need a follow-up today. */
export default async function FinancePage({ searchParams }: { searchParams: Promise<{ notify?: string }> }) {
  const { summary, attention } = await getFinanceOverview();
  const highlight = (await searchParams).notify === "due";

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle="Instalments of units sold on a payment plan: take the money in, and follow up the buyers who have not paid"
        actions={
          <Link href="/finance/installments" className="button button--ghost">
            All instalments
          </Link>
        }
      />
      <div className="grid grid--4">
        <StatCard label="Still to receive" value={formatCompactMoney(summary.receivable)} hint={`${formatCompactMoney(summary.collected)} received so far`} />
        <StatCard label="Overdue" value={formatCompactMoney(summary.overdue.amount)} tone={summary.overdue.count ? "negative" : "default"} hint={`${summary.overdue.count} instalments`} />
        <StatCard label="Due today" value={formatCompactMoney(summary.dueToday.amount)} hint={`${summary.dueToday.count} instalments`} />
        <StatCard label="Due in the next 7 days" value={formatCompactMoney(summary.nextWeek.amount)} hint={`${summary.nextWeek.count} instalments`} />
      </div>
      <div className="grid grid--3">
        <StatCard label="Units booked (instalments running)" value={String(summary.bookedUnits)} />
        <StatCard label="Need a follow-up now" value={String(summary.needFollowUp)} tone={summary.needFollowUp ? "negative" : "default"} />
      </div>

      <Card title={`Follow up now (${attention.length})`}>
        <InstallmentTable items={attention} actions highlight={highlight} />
      </Card>
    </>
  );
}
