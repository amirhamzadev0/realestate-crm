import type { AgentPerformance } from "@/models/sales";
import { formatMoney } from "@/utils/format";

export function AgentPerformanceTable({ rows }: { rows: AgentPerformance[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Agent</th>
            <th className="num">Leads</th>
            <th className="num">Sales</th>
            <th className="num">Revenue</th>
            <th className="num">Commission earned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.agentId}>
              <td>{row.agentName}</td>
              <td className="num">{row.leads}</td>
              <td className="num">{row.sales}</td>
              <td className="num">{formatMoney(row.revenue)}</td>
              <td className="num">{formatMoney(row.commission)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
