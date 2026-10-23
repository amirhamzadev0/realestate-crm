import type { Metadata } from "next";
import { AgentReportsView } from "@/components/sales/AgentReportsView";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agent reports" };

export default async function AgentReportsPage({ searchParams }: { searchParams: Promise<{ month?: string; agent?: string }> }) {
  const query = await searchParams;
  return (
    <>
      <PageHeader title="Agent reports" subtitle="How many units each agent has sold, overall and month by month. Every month is saved." />
      <AgentReportsView basePath="/sales/agent-reports" month={query.month} agent={query.agent} />
    </>
  );
}
