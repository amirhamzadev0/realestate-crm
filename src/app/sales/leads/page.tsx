import type { Metadata } from "next";
import { LeadForm } from "@/components/forms/LeadForm";
import { LeadTable } from "@/components/sales/LeadTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLeadsPage } from "@/viewmodels/sales.viewmodel";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
  const { leads, agents, activeAgents, campaigns, projects, projectNames } = await getLeadsPage();

  return (
    <>
      <PageHeader title="Leads" subtitle="Captured from Facebook campaigns, walk-ins and referrals" />
      <Card title="Add lead">
        <LeadForm projects={projects} agents={activeAgents} campaigns={campaigns} />
      </Card>
      <Card title={`All leads (${leads.length})`}>
        <LeadTable leads={leads} agents={agents} campaigns={campaigns} projectNames={projectNames} />
      </Card>
    </>
  );
}
