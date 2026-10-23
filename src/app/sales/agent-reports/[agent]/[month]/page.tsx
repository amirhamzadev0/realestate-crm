import type { Metadata } from "next";
import { AgentMonthDetailView } from "@/components/sales/AgentMonthDetailView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agent report" };

export default async function AgentMonthPage({ params }: { params: Promise<{ agent: string; month: string }> }) {
  const { agent, month } = await params;
  return <AgentMonthDetailView basePath="/sales/agent-reports" agentId={agent} period={month} />;
}
