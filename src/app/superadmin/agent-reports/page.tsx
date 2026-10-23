import type { Metadata } from "next";
import { AgentReportsView } from "@/components/sales/AgentReportsView";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Agent reports" };

export default async function AgentReportsPage({ searchParams }: { searchParams: Promise<{ month?: string; agent?: string }> }) {
  const query = await searchParams;
  return (
    <>
      <PageHeader title="Agent reports" subtitle="How each agent is progressing: units sold overall and month by month. Every month is saved." />
      <AgentReportsView basePath="/superadmin/agent-reports" month={query.month} agent={query.agent} />
    </>
  );
}
