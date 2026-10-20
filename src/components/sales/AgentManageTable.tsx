import { ActionButton } from "@/components/forms/ActionButton";
import { AgentEditForm } from "@/components/forms/AgentForm";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageHeader";
import type { Agent, AgentPerformance } from "@/models/sales";
import { formatMoney, phoneHref } from "@/utils/format";

export function AgentManageTable({
  agents,
  performance,
  pendingIds,
}: {
  agents: Agent[];
  performance: AgentPerformance[];
  pendingIds: string[];
}) {
  if (agents.length === 0) return <EmptyState>No agents yet.</EmptyState>;
  const stats = new Map(performance.map((p) => [p.agentId, p]));
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th className="num">Commission rate</th>
            <th className="num">Leads</th>
            <th className="num">Sales</th>
            <th className="num">Commission earned</th>
            <th>Change (needs Super Admin approval)</th>
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
                <td className="num">{agent.commissionRate}%</td>
                <td className="num">{row?.leads ?? 0}</td>
                <td className="num">{row?.sales ?? 0}</td>
                <td className="num">{formatMoney(row?.commission ?? 0)}</td>
                <td>
                  {pendingIds.includes(agent.id) ? (
                    <Badge tone="warning">change pending</Badge>
                  ) : (
                    <div className="row-actions">
                      <details className="row-edit">
                        <summary className="button button--ghost button--small">Edit</summary>
                        <AgentEditForm agent={agent} />
                      </details>
                      <ActionButton
                        operation="requestPersonChange"
                        body={{ kind: "agent", action: "remove", targetId: agent.id }}
                        label="Request removal"
                        variant="danger"
                        confirm={`Ask the Super Admin to remove ${agent.name}?`}
                      />
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
