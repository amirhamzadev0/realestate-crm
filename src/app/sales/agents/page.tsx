import type { Metadata } from "next";
import { AgentForm } from "@/components/forms/AgentForm";
import { AgentManageTable } from "@/components/sales/AgentManageTable";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { getAgentsPage } from "@/viewmodels/sales.viewmodel";

export const metadata: Metadata = { title: "Agents" };

export default async function AgentsPage() {
  const { performance, agents, managers } = await getAgentsPage();

  return (
    <>
      <PageHeader title="Agents" subtitle="Create your agents, see the leads they handle and the commission they earn. Each agent has their own portal." />
      <Card title="Team">
        <AgentManageTable agents={agents} performance={performance} managers={managers} />
      </Card>
      <Card title="Create a new agent">
        {managers.length === 0 ? (
          <EmptyState>The Super Admin has to create a sales manager first (Sales team).</EmptyState>
        ) : (
          <AgentForm managers={managers} />
        )}
      </Card>
    </>
  );
}
