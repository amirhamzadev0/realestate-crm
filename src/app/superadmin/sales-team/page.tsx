import type { Metadata } from "next";
import Link from "next/link";
import { NewSalesManagerForm, SalesManagerEditForm } from "@/components/forms/SalesManagerForms";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { formatMoney } from "@/utils/format";
import { getSalesTeamPage } from "@/viewmodels/superadmin.viewmodel";

export const metadata: Metadata = { title: "Sales team" };

export default async function SalesTeamPage() {
  const { managers, agents } = await getSalesTeamPage();

  return (
    <>
      <PageHeader
        title="Sales team"
        subtitle="The sales department has a sales manager and agents. You create the manager; the manager creates the agents and can sell too. Each agent has their own portal."
      />
      <Card title="Sales managers">
        {managers.length === 0 ? (
          <EmptyState>No sales manager yet. Create one below.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th className="num">Agents</th>
                  <th className="num">Own sales</th>
                  <th>Status</th>
                  <th>Edit</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((manager) => (
                  <tr key={manager.id}>
                    <td>{manager.name}</td>
                    <td>
                      {manager.phone || "-"}
                      {manager.email ? <div className="muted">{manager.email}</div> : null}
                    </td>
                    <td className="num">{manager.agentCount}</td>
                    <td className="num">{manager.ownSales}</td>
                    <td>
                      <Badge tone={manager.active ? "success" : "neutral"}>{manager.active ? "active" : "inactive"}</Badge>
                    </td>
                    <td>
                      <details className="row-edit">
                        <summary className="button button--ghost button--small">Edit</summary>
                        <SalesManagerEditForm manager={manager} />
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Create a sales manager">
        <NewSalesManagerForm />
      </Card>
      <Card title={`Agents (${agents.length})`}>
        {agents.length === 0 ? (
          <EmptyState>No agents yet. The sales manager creates them.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Sales manager</th>
                  <th className="num">Sales</th>
                  <th className="num">Revenue</th>
                  <th className="num">Commission</th>
                  <th>Portal</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td>{agent.name}</td>
                    <td>{agent.managerName}</td>
                    <td className="num">{agent.sales}</td>
                    <td className="num">{formatMoney(agent.revenue)}</td>
                    <td className="num">{formatMoney(agent.commission)}</td>
                    <td>
                      <Link className="link" href={`/agent/${agent.id}`}>
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
