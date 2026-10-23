import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { visibleNav } from "@/config/access";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { agentNav, salesNav } from "@/config/navigation";
import { requireRole } from "@/server/auth/session";
import { authService, salesService } from "@/server/container";
import { formatMoney } from "@/utils/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agent portals" };

/** The sales manager's view of the agents: pick an agent to open their portal. An agent goes straight to their own. */
export default async function AgentPortalsPage() {
  const user = await requireRole(["superadmin", "sales", "agent"]);
  if (user.role === "agent") redirect(await authService.homeFor(user));

  const [agents, report, managers] = await Promise.all([salesService.listAgents(), salesService.report(), salesService.listSalesManagers()]);
  const stats = new Map(report.agents.map((a) => [a.agentId, a]));
  const managerName = new Map(managers.map((m) => [m.id, m.name]));
  const active = agents.filter((a) => a.active);

  return (
    <AppShell portal="Sales" subtitle="Agents, leads and commission" items={visibleNav(salesNav, user.role)} user={user}>
      <PageHeader title="Agent portals" subtitle="Each agent has their own portal with the leads forwarded to them, their sales and their commission" />
      <Card title={`Agents (${active.length})`}>
        {active.length === 0 ? (
          <EmptyState>No agents yet. Create them in Manager, Agents.</EmptyState>
        ) : (
          <div className="grid grid--3">
            {active.map((agent) => {
              const row = stats.get(agent.id);
              return (
                <Link key={agent.id} href={`/agent/${agent.id}`} className="project-card">
                  <div className="project-card__top">
                    <h3 className="project-card__title">{agent.name}</h3>
                  </div>
                  <p className="muted">Team of {agent.managerId ? (managerName.get(agent.managerId) ?? "-") : "-"}</p>
                  <dl className="project-card__facts">
                    <div>
                      <dt>Leads</dt>
                      <dd>{row?.leads ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Sales</dt>
                      <dd>{row?.sales ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Commission</dt>
                      <dd>{formatMoney(row?.commission ?? 0)}</dd>
                    </div>
                  </dl>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </AppShell>
  );
}
