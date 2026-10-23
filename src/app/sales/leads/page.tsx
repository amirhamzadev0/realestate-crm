import type { Metadata } from "next";
import { LeadForm } from "@/components/forms/LeadForm";
import { ShareLeadsEqually } from "@/components/forms/ShareLeadsEqually";
import { LeadTable } from "@/components/sales/LeadTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLeadsPage } from "@/viewmodels/sales.viewmodel";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
  const { leads, agents, activeAgents, projects, projectNames } = await getLeadsPage();
  const unassigned = leads.filter((l) => !l.agentId).length;

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Add the clients who ask about a project, then forward each lead to an agent, or divide them equally among all agents. The agent sees it in their portal."
      />
      <Card title="Add a lead">
        <LeadForm projects={projects} agents={activeAgents} />
      </Card>
      <Card title="Share leads among agents">
        <ShareLeadsEqually unassigned={unassigned} agentCount={activeAgents.length} />
      </Card>
      <Card title={`All leads (${leads.length})`}>
        <LeadTable leads={leads} agents={agents} projectNames={projectNames} />
      </Card>
    </>
  );
}
