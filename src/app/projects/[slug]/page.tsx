import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountSummaryCards } from "@/components/accounts/AccountSummaryCards";
import { RequestTable } from "@/components/inventory/RequestTable";
import { StockTable } from "@/components/inventory/StockTable";
import { Badge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatCompactMoney } from "@/utils/format";
import { getProjectOverview, getProjectShell } from "@/viewmodels/project.viewmodel";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const project = await getProjectShell((await params).slug);
  return { title: project?.name ?? "Project" };
}

export default async function ProjectOverviewPage({ params }: Props) {
  const data = await getProjectOverview((await params).slug);
  if (!data) notFound();
  const { project, accounts, hr, lowStock, openRequests } = data;

  return (
    <>
      <PageHeader title={project.name} subtitle={`${project.location} - ${project.totalUnits} units`} actions={<Badge>{project.status}</Badge>} />

      <h2 className="section-title">Accounts</h2>
      <AccountSummaryCards summary={accounts} />

      <h2 className="section-title">HR</h2>
      <div className="grid grid--4">
        <StatCard label="Employees" value={String(hr.employees)} />
        <StatCard label="Labour" value={String(hr.labour)} />
        <StatCard label="Payroll paid this month" value={formatCompactMoney(hr.monthlyPayroll)} />
        <StatCard label="Pending salaries" value={formatCompactMoney(hr.pendingPayroll)} tone={hr.pendingCount ? "negative" : "default"} />
      </div>

      <Card title="Low stock on site">
        <StockTable stock={lowStock} />
      </Card>
      <Card title="Open material requests">
        <RequestTable requests={openRequests} showProject={false} />
      </Card>
    </>
  );
}
