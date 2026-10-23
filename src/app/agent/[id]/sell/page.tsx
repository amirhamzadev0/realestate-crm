import type { Metadata } from "next";
import { DirectSalesPanel } from "@/components/sales/DirectSalesPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAgentPortal } from "@/viewmodels/sales.viewmodel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sell a unit" };

/** An agent sells a unit the same way the Super Admin does: choose the project, then the plot type, floor and unit, then the buyer. */
export default async function AgentSellPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ project?: string; lead?: string }>;
}) {
  const { id } = await params;
  const { project, lead } = await searchParams;
  const portal = await getAgentPortal(id); // the layout has already checked it exists and that it is this agent's
  const leads = (portal?.leads ?? []).filter((l) => l.status !== "won").map((l) => ({ id: l.id, name: l.name, phone: l.phone, email: l.email }));
  // Coming from a lead's "Sell" button, open the project that lead asked about.
  const slug = project ?? (lead ? portal?.projectSlug[portal.leads.find((l) => l.id === lead)?.projectId ?? ""] : undefined);

  return (
    <>
      <PageHeader title="Sell a unit" subtitle="Choose a project, then the plot type, floor and unit. You can give a discount. The sale is recorded under your name and your commission is worked out." />
      <DirectSalesPanel slug={slug} basePath={`/agent/${id}/sell`} asAgent={{ id, leads, defaultLeadId: leads.some((l) => l.id === lead) ? lead : undefined }} />
    </>
  );
}
