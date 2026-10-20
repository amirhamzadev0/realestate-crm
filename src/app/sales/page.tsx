import type { Metadata } from "next";
import { AgentPerformanceTable } from "@/components/sales/AgentPerformanceTable";
import { CampaignTable } from "@/components/sales/CampaignTable";
import { LeadTable } from "@/components/sales/LeadTable";
import { SalesReportCards } from "@/components/sales/SalesReportCards";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCampaignsPage, getLeadsPage, getSalesDashboard } from "@/viewmodels/sales.viewmodel";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesPage() {
  const [{ report }, { leads, agents, campaigns, projectNames }, { rows }] = await Promise.all([
    getSalesDashboard(),
    getLeadsPage(),
    getCampaignsPage(),
  ]);

  return (
    <>
      <PageHeader title="Sales overview" subtitle="All projects under the Super Admin" />
      <SalesReportCards report={report} />
      <Card title="Facebook and Instagram campaigns">
        <CampaignTable rows={rows} />
      </Card>
      <Card title="Agent performance">
        <AgentPerformanceTable rows={report.agents} />
      </Card>
      <Card title="Latest leads">
        <LeadTable leads={leads.slice(0, 5)} agents={agents} campaigns={campaigns} projectNames={projectNames} />
      </Card>
    </>
  );
}
