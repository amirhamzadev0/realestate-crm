import Link from "next/link";
import { AgentRemover } from "@/components/forms/AgentRemover";
import { AgentEditForm } from "@/components/forms/AgentForm";
import { EmptyState } from "@/components/ui/PageHeader";
import type { Agent, AgentPerformance, SalesManager } from "@/models/sales";
import { formatMoney, phoneHref } from "@/utils/format";

/** The sales manager's team: edit an agent, remove one (deactivate: past sales and commission stay), or open their portal. */
export function AgentManageTable({
  agents,
  performance,
  managers,
  openLeads,
}: {
  agents: (Agent & { managerName: string })[];
  openLeads: Record<string, number>;
  performance: AgentPerformance[];
  managers: SalesManager[];
}) {
  if (agents.length === 0) return <EmptyState>No agents yet.</EmptyState>;
  const stats = new Map(performance.map((p) => [p.agentId, p]));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th>Manager</th>
            <th className="num">Commission rate</th>
            <th className="num">Leads</th>
            <th className="num">Sales</th>
            <th className="num">Commission earned</th>
            <th>Manage</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent) => {
            const row = stats.get(agent.id);
            return (
              <tr key={agent.id}>
                <td>
                  {agent.name}
                  {agent.phone ? (
                    <div>
                      <a className="muted" href={phoneHref(agent.phone)}>
                        {agent.phone}
                      </a>
                    </div>
                  ) : null}
                </td>
                <td>{agent.managerName}</td>
                <td className="num">{agent.commissionRate}%</td>
                <td className="num">{row?.leads ?? 0}</td>
                <td className="num">{row?.sales ?? 0}</td>
                <td className="num">{formatMoney(row?.commission ?? 0)}</td>
                <td>
                  <div className="row-actions">
                    <Link href={`/agent/${agent.id}`} className="button button--ghost button--small">
                      Open portal
                    </Link>
                    <details className="row-edit">
                      <summary className="button button--ghost button--small">Edit</summary>
                      <AgentEditForm agent={agent} managers={managers} />
                    </details>
                    <AgentRemover agent={agent} openLeads={openLeads[agent.id] ?? 0} otherAgents={agents.filter((a) => a.id !== agent.id)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
