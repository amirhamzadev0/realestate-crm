import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { formatDate, formatMoney } from "@/utils/format";
import { getBookedSales } from "@/viewmodels/finance.viewmodel";

export const metadata: Metadata = { title: "Booked units" };

/** Every unit sold on a payment plan: booked while instalments are running, sold once the last one is paid. */
export default async function BookedSalesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { projects, project, rows } = await getBookedSales((await searchParams).project);

  return (
    <>
      <PageHeader title="Booked units" subtitle="Units sold on instalments. A unit stays booked until the last instalment is paid, then it is marked sold." />
      <form className="inline-form" method="get">
        <label className="field">
          <span className="field__label">Project</span>
          <select name="project" defaultValue={project?.slug ?? ""}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button button--small">
          Show
        </button>
      </form>
      <Card title={`Units on instalments (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState>No unit has been sold on instalments yet.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Project and unit</th>
                  <th>Sold on</th>
                  <th className="num">Price</th>
                  <th className="num">Received</th>
                  <th className="num">Still owed</th>
                  <th>Instalments left</th>
                  <th>Next due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ sale, projectName, paid, remaining, left, total, overdue, next }) => (
                  <tr key={sale.id}>
                    <td>
                      <Link href={`/finance/sales/${sale.id}`} className="link">
                        {sale.buyer ?? "Buyer"}
                      </Link>
                      {sale.buyerPhone ? <div className="muted">{sale.buyerPhone}</div> : null}
                    </td>
                    <td>
                      {projectName}
                      <div className="muted">
                        {sale.floor ? `Floor ${sale.floor}, ` : ""}unit {sale.unit}
                      </div>
                    </td>
                    <td>{formatDate(sale.date)}</td>
                    <td className="num">{formatMoney(sale.price)}</td>
                    <td className="num">{formatMoney(paid)}</td>
                    <td className="num">{formatMoney(remaining)}</td>
                    <td>
                      {left} of {total}
                      {overdue > 0 ? <div className="follow-up__due">{overdue} overdue</div> : null}
                    </td>
                    <td>{next ? (next.dueDate ? formatDate(next.dueDate) : "On possession") : "-"}</td>
                    <td>
                      <Badge tone={sale.status === "booked" ? "warning" : "success"}>{sale.status === "booked" ? "booked" : "sold"}</Badge>
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
