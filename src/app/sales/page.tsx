import type { Metadata } from "next";
import { AgentPerformanceTable } from "@/components/sales/AgentPerformanceTable";
import { LeadTable } from "@/components/sales/LeadTable";
import { SalesReportCards } from "@/components/sales/SalesReportCards";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLeadsPage, getSalesDashboard } from "@/viewmodels/sales.viewmodel";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage() {
  const [{ report }, { leads, agents, projectNames }] = await Promise.all([getSalesDashboard(), getLeadsPage()]);

  return (
    <>
      <PageHeader title="Sales overview" subtitle="All projects under the Super Admin" />
      <SalesReportCards report={report} />
      <Card title="Agent performance">
        <AgentPerformanceTable rows={report.agents} />
      </Card>
      <Card title="Latest leads">
        <LeadTable leads={leads.slice(0, 5)} agents={agents} projectNames={projectNames} />
      </Card>
    </>
  );
}
