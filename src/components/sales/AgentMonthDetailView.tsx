import { notFound } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "@/components/sales/PrintButton";
import { Badge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/PageHeader";
import { formatCompactMoney, formatDate, formatMoney, formatMonth } from "@/utils/format";
import { getAgentMonthDetail } from "@/viewmodels/sales.viewmodel";

/** One agent's report for one month: the numbers, the sales and the leads. It can be downloaded (CSV) or printed (PDF). */
export async function AgentMonthDetailView({ basePath, agentId, period }: { basePath: string; agentId: string; period: string }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) notFound();
  const detail = await getAgentMonthDetail(agentId, period);
  if (!detail) notFound();
  const { agent, row, sales, leads, projectName, savedAt } = detail;
  const csv = `/reports/agent-month?agent=${agent.id}&month=${period}`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header__title">
            {agent.name} - {formatMonth(period)}
          </h1>
          <p className="page-header__subtitle">
            {savedAt ? `Saved report, ${formatDate(savedAt.slice(0, 10))}` : "This month is still running, so the numbers are live"}
          </p>
        </div>
        <div className="row-actions no-print">
          <Link href={`${basePath}?agent=${agent.id}`} className="button button--ghost button--small">
            All months of {agent.name}
          </Link>
          <a href={csv} download className="button button--small">
            Download (Excel / CSV)
          </a>
          <PrintButton />
        </div>
      </div>

      <div className="grid grid--4">
        <StatCard label="Units sold" value={String(row.units)} />
        <StatCard label="Sales value" value={formatCompactMoney(row.revenue)} tone="positive" />
        <StatCard label="Commission" value={formatCompactMoney(row.commission)} tone="positive" hint={`${agent.commissionRate}% rate`} />
        <StatCard label="Leads forwarded" value={String(row.leads)} hint={`${row.calls} calls, ${row.whatsapp} WhatsApp`} />
      </div>

      <Card title={`Sales in ${formatMonth(period)} (${sales.length})`}>
        {sales.length === 0 ? (
          <EmptyState>No sale this month.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Unit</th>
                  <th>Buyer</th>
                  <th className="num">Price paid</th>
                  <th className="num">Commission</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{formatDate(sale.date)}</td>
                    <td>{projectName[sale.projectId] ?? "-"}</td>
                    <td>
                      {sale.unit}
                      {sale.floor ? <div className="muted">Floor {sale.floor}</div> : null}
                    </td>
                    <td>{sale.buyer || "-"}</td>
                    <td className="num">
                      {formatMoney(sale.price)}
                      {sale.discountAmount ? <div className="muted">discount {formatMoney(sale.discountAmount)}</div> : null}
                    </td>
                    <td className="num">{formatMoney(sale.commission)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Leads forwarded in ${formatMonth(period)} (${leads.length})`}>
        {leads.length === 0 ? (
          <EmptyState>No lead was forwarded this month.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Forwarded</th>
                  <th>Client</th>
                  <th>Project</th>
                  <th>Stage</th>
                  <th className="num">Calls</th>
                  <th className="num">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>{formatDate(lead.assignedAt ?? lead.createdAt)}</td>
                    <td>
                      {lead.name}
                      <div className="muted">{lead.phone}</div>
                    </td>
                    <td>{projectName[lead.projectId] ?? "-"}</td>
                    <td>
                      <Badge>{lead.status}</Badge>
                    </td>
                    <td className="num">{lead.contacts.calls}</td>
                    <td className="num">{lead.contacts.whatsapp}</td>
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
