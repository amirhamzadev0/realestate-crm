import type { Metadata } from "next";
import { AgentForm } from "@/components/forms/AgentForm";
import { ChangeRequestTable } from "@/components/people/ChangeRequestTable";
import { AgentManageTable } from "@/components/sales/AgentManageTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAgentsPage } from "@/viewmodels/sales.viewmodel";

export const metadata: Metadata = { title: "Agents" };

export default async function AgentsPage() {
  const { performance, agents, changes, pendingIds } = await getAgentsPage();

  return (
    <>
      <PageHeader title="Agents" subtitle="Sales team, leads handled and commission earned" />
      <Card title="Team">
        <AgentManageTable agents={agents} performance={performance} pendingIds={pendingIds} />
      </Card>
      <Card title="Request a new agent">
        <AgentForm />
      </Card>
      <Card title="Requests sent to Super Admin">
        <ChangeRequestTable requests={changes} />
      </Card>
    </>
  );
}
