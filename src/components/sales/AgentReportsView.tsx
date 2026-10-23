import Link from "next/link";
import { ActionButton } from "@/components/forms/ActionButton";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/PageHeader";
import type { AgentReportRow } from "@/models/sales";
import { formatDate, formatMoney, formatMonth, formatNumber } from "@/utils/format";
import { getAgentReportsPage } from "@/viewmodels/sales.viewmodel";

const sum = (rows: AgentReportRow[], pick: (row: AgentReportRow) => number) => rows.reduce((total, row) => total + pick(row), 0);

/** Up or down compared with last month. */
function Change({ now, before }: { now: number; before: number }) {
  if (now === before) return <span className="muted">no change</span>;
  return <Badge tone={now > before ? "success" : "danger"}>{`${now > before ? "up" : "down"} ${Math.abs(now - before)}`}</Badge>;
}

function ReportTable({ rows, previousUnits }: { rows: AgentReportRow[]; previousUnits?: Record<string, number> }) {
  if (rows.length === 0) return <EmptyState>Nothing to report yet.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th className="num">Leads</th>
            <th className="num">Calls</th>
            <th className="num">WhatsApp</th>
            <th className="num">Units sold</th>
            {previousUnits ? <th>Compared with last month</th> : null}
            <th className="num">Sales value</th>
            <th className="num">Commission</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.name}</td>
              <td className="num">{row.leads}</td>
              <td className="num">{row.calls}</td>
              <td className="num">{row.whatsapp}</td>
              <td className="num">
                <strong>{row.units}</strong>
              </td>
              {previousUnits ? (
                <td>
                  <Change now={row.units} before={previousUnits[row.key] ?? 0} />
                </td>
              ) : null}
              <td className="num">{formatMoney(row.revenue)}</td>
              <td className="num">{formatMoney(row.commission)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <th className="num">{sum(rows, (r) => r.leads)}</th>
            <th className="num">{sum(rows, (r) => r.calls)}</th>
            <th className="num">{sum(rows, (r) => r.whatsapp)}</th>
            <th className="num">{sum(rows, (r) => r.units)}</th>
            {previousUnits ? (
              <th>
                <Change now={sum(rows, (r) => r.units)} before={Object.values(previousUnits).reduce((a, b) => a + b, 0)} />
              </th>
            ) : null}
            <th className="num">{formatMoney(sum(rows, (r) => r.revenue))}</th>
            <th className="num">{formatMoney(sum(rows, (r) => r.commission))}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * The agent reports, for the Super Admin and the sales manager: how many units each agent has sold overall, a report for every
 * month (saved, so the history stays), and how each agent's numbers moved from month to month.
 */
export async function AgentReportsView({ basePath, month, agent }: { basePath: string; month?: string; agent?: string }) {
  const data = await getAgentReportsPage(month, agent);

  return (
    <>
      <Card title="Overall report, all agents, since the start">
        <ReportTable rows={data.overall} />
      </Card>

      <Card
        title={`Monthly report - ${formatMonth(data.selected)}${data.isLive ? " (so far)" : ""}`}
        action={
          <span className="row-actions">
            <a href={`/reports/agent-month?month=${data.selected}`} download className="button button--ghost button--small">
              Download this month (CSV)
            </a>
            {data.isLive ? <ActionButton operation="saveMonthlyReport" body={{ period: data.selected }} label="Save this report now" /> : null}
          </span>
        }
      >
        <div className="chips">
          {data.months.map((period) => (
            <Link key={period} href={`${basePath}?month=${period}`} className={`chip${period === data.selected ? " chip--active" : ""}`}>
              {formatMonth(period)}
              {period === data.current ? " (now)" : ""}
            </Link>
          ))}
        </div>
        <form method="get" action={basePath} className="inline-form">
          <label className="field">
            <span className="field__label">Open any month</span>
            <input type="month" name="month" defaultValue={data.selected} max={data.current} />
          </label>
          <button type="submit" className="button button--ghost button--small">
            Show report
          </button>
        </form>
        <ReportTable rows={data.selectedRows} previousUnits={data.previousUnits} />
        <p className="muted">
          {data.isLive
            ? "This month is still running, so the numbers are live. They are saved automatically as soon as the month ends; press Save to keep a copy now."
            : data.savedAt
              ? `Saved automatically on ${formatDate(data.savedAt.slice(0, 10))}. Reports of finished months are kept as they were.`
              : "Worked out from the records of that month."}
        </p>
      </Card>

      <Card title={data.agentHistory ? `${data.agentHistory.name} - every month` : "Report of one agent, every month"}>
        <div className="chips">
          {data.overall.map((row) => (
            <Link
              key={row.key}
              href={`${basePath}?agent=${row.key}&month=${data.selected}`}
              className={`chip${row.key === data.agentHistory?.key ? " chip--active" : ""}`}
            >
              {row.name}
            </Link>
          ))}
        </div>
        {data.agentHistory ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Leads</th>
                  <th className="num">Calls</th>
                  <th className="num">WhatsApp</th>
                  <th className="num">Units sold</th>
                  <th className="num">Sales value</th>
                  <th className="num">Commission</th>
                  <th>Open or save</th>
                </tr>
              </thead>
              <tbody>
                {data.agentHistory.months.map(({ period, row, final }) => (
                  <tr key={period}>
                    <td>
                      {formatMonth(period)} {final ? null : <Badge tone="warning">so far</Badge>}
                    </td>
                    <td className="num">{row.leads}</td>
                    <td className="num">{row.calls}</td>
                    <td className="num">{row.whatsapp}</td>
                    <td className="num">
                      <strong>{row.units}</strong>
                    </td>
                    <td className="num">{formatMoney(row.revenue)}</td>
                    <td className="num">{formatMoney(row.commission)}</td>
                    <td>
                      <div className="row-actions">
                        <Link className="button button--ghost button--small" href={`${basePath}/${data.agentHistory!.key}/${period}`}>
                          View
                        </Link>
                        <a className="button button--small" href={`/reports/agent-month?agent=${data.agentHistory!.key}&month=${period}`} download>
                          Download
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>All months</th>
                  <th className="num">{data.agentHistory.months.reduce((n, m) => n + m.row.leads, 0)}</th>
                  <th className="num">{data.agentHistory.months.reduce((n, m) => n + m.row.calls, 0)}</th>
                  <th className="num">{data.agentHistory.months.reduce((n, m) => n + m.row.whatsapp, 0)}</th>
                  <th className="num">{data.agentHistory.months.reduce((n, m) => n + m.row.units, 0)}</th>
                  <th className="num">{formatMoney(data.agentHistory.months.reduce((n, m) => n + m.row.revenue, 0))}</th>
                  <th className="num">{formatMoney(data.agentHistory.months.reduce((n, m) => n + m.row.commission, 0))}</th>
                  <th />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState>Choose an agent above to see their report for every month since they started.</EmptyState>
        )}
      </Card>

      <Card title="Progress, units sold month by month">
        {data.progress.people.length === 0 ? (
          <EmptyState>No sales yet.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Agent</th>
                  {data.progress.months.map((period) => (
                    <th key={period} className="num">
                      {formatMonth(period)}
                    </th>
                  ))}
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {data.progress.people.map((person) => (
                  <tr key={person.key}>
                    <td>{person.name}</td>
                    {person.units.map((units, index) => (
                      <td key={data.progress.months[index]} className="num">
                        {units}
                      </td>
                    ))}
                    <td>
                      <Change now={person.units[person.units.length - 1]} before={person.units[person.units.length - 2] ?? 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Saved monthly reports">
        {data.history.length === 0 ? (
          <EmptyState>No month has been saved yet. Each month is saved automatically once it ends.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Units sold</th>
                  <th className="num">Sales value</th>
                  <th>Saved</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.history.map((report) => (
                  <tr key={report.period}>
                    <td>{formatMonth(report.period)}</td>
                    <td className="num">{formatNumber(report.units)}</td>
                    <td className="num">{formatMoney(report.revenue)}</td>
                    <td>
                      {formatDate(report.generatedAt.slice(0, 10))} {report.final ? null : <Badge tone="warning">so far</Badge>}
                    </td>
                    <td>
                      <Link className="link" href={`${basePath}?month=${report.period}`}>
                        View
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
