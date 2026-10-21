import { EmptyState } from "@/components/ui/PageHeader";
import { categoryLabels, saleUnit, type Project } from "@/models/project";
import type { Sale } from "@/models/sales";
import { formatDate, formatMoney, formatNumber } from "@/utils/format";

/** Every sale of one project, newest first, with the buyer's details and who sold it. */
export function ProjectSalesTable({ project, sales, agentNames }: { project: Project; sales: Sale[]; agentNames: Record<string, string> }) {
  if (sales.length === 0) return <EmptyState>Nothing sold in this project yet.</EmptyState>;
  const highRise = project.type === "high-rise";
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>{highRise ? "Unit" : "Plot"}</th>
            {highRise ? <th>Floor</th> : null}
            <th>Type</th>
            <th className="num">{highRise ? "Area" : "Size"}</th>
            <th className="num">Price</th>
            <th>Buyer</th>
            <th>Sold by</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale) => (
            <tr key={sale.id}>
              <td>{formatDate(sale.date)}</td>
              <td>{sale.unit}</td>
              {highRise ? <td>{sale.floor ?? "-"}</td> : null}
              <td>{categoryLabels[sale.category] ?? sale.category}</td>
              <td className="num">
                {formatNumber(sale.area)} {saleUnit[project.type].area}
              </td>
              <td className="num">
                {formatMoney(sale.price)}
                {sale.discountAmount ? <div className="muted">list {formatMoney(sale.listPrice)}, discount {formatMoney(sale.discountAmount)}</div> : null}
              </td>
              <td>
                {sale.buyer || "-"}
                {sale.buyerPhone ? <div className="muted">{sale.buyerPhone}</div> : null}
                {sale.buyerCnic ? <div className="muted">CNIC {sale.buyerCnic}</div> : null}
                {sale.buyerEmail ? <div className="muted">{sale.buyerEmail}</div> : null}
              </td>
              <td>{sale.agentId ? (agentNames[sale.agentId] ?? "Agent") : "Direct sale"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
