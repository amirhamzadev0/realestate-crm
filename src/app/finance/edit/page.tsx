import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { formatDate, formatMoney } from "@/utils/format";
import { getBookedSales } from "@/viewmodels/finance.viewmodel";

export const metadata: Metadata = { title: "Edit instalments" };

/** Find a buyer to change their plan: pick the project, or type the buyer's name, and open the plan. */
export default async function EditInstallmentsPage({ searchParams }: { searchParams: Promise<{ project?: string; q?: string }> }) {
  const query = await searchParams;
  const { projects, project, rows } = await getBookedSales(query.project);
  const needle = (query.q ?? "").trim().toLowerCase();
  const found = rows.filter(
    (r) => r.sale.status === "booked" && (!needle || (r.sale.buyer ?? "").toLowerCase().includes(needle) || (r.sale.buyerPhone ?? "").includes(needle) || r.sale.unit.toLowerCase().includes(needle)),
  );

  return (
    <>
      <PageHeader
        title="Edit instalments"
        subtitle="Find the buyer, open their plan and change it: a longer or shorter plan, another day of the month, or the date of one instalment."
      />
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
        <label className="field">
          <span className="field__label">Buyer name, phone or unit</span>
          <input name="q" type="text" defaultValue={query.q ?? ""} placeholder="Search" />
        </label>
        <button type="submit" className="button button--small">
          Search
        </button>
      </form>

      <Card title={`Units on instalments (${found.length})`}>
        {found.length === 0 ? (
          <EmptyState>No booked unit matches.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Project and unit</th>
                  <th className="num">Still owed</th>
                  <th>Instalments left</th>
                  <th>Next due</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {found.map(({ sale, projectName, remaining, left, total, overdue, next }) => (
                  <tr key={sale.id}>
                    <td>
                      {sale.buyer ?? "Buyer"}
                      {sale.buyerPhone ? <div className="muted">{sale.buyerPhone}</div> : null}
                    </td>
                    <td>
                      {projectName}
                      <div className="muted">
                        {sale.floor ? `Floor ${sale.floor}, ` : ""}unit {sale.unit}
                      </div>
                    </td>
                    <td className="num">{formatMoney(remaining)}</td>
                    <td>
                      {left} of {total}
                      {overdue > 0 ? <Badge tone="danger">{`${overdue} overdue`}</Badge> : null}
                    </td>
                    <td>{next ? (next.dueDate ? formatDate(next.dueDate) : "On possession") : "-"}</td>
                    <td>
                      <Link href={`/finance/sales/${sale.id}`} className="button button--small">
                        Edit plan
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
