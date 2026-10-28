import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { formatDate, formatMoney } from "@/utils/format";
import { getLedgers, type LedgerStatus } from "@/viewmodels/finance.viewmodel";

export const metadata: Metadata = { title: "Ledgers" };

const STATUSES: { value: LedgerStatus; label: string }[] = [
  { value: "all", label: "Every plan" },
  { value: "booked", label: "Still running" },
  { value: "sold", label: "Fully paid" },
];

/** One ledger per buyer on a payment plan. Search or filter, then open a buyer's ledger. */
export default async function LedgersPage({ searchParams }: { searchParams: Promise<{ project?: string; q?: string; status?: string }> }) {
  const query = await searchParams;
  const status = STATUSES.some((s) => s.value === query.status) ? (query.status as LedgerStatus) : "all";
  const { projects, project, rows } = await getLedgers(query.project, query.q ?? "", status);
  const downloadQuery = new URLSearchParams({ ...(project ? { project: project.slug } : {}), ...(query.q ? { q: query.q } : {}), status }).toString();

  return (
    <>
      <PageHeader
        title="Ledgers"
        subtitle="Every buyer on a payment plan: when they bought, how long the plan is, what they paid and what is left. Open a ledger to see every instalment."
        actions={
          <a className="button button--ghost" href={`/reports/ledger?${downloadQuery}`}>
            Download this list
          </a>
        }
      />
      <form className="inline-form" method="get">
        <label className="field">
          <span className="field__label">Search a buyer</span>
          <input name="q" type="search" defaultValue={query.q ?? ""} placeholder="Name, phone or unit" />
        </label>
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
          <span className="field__label">Show</span>
          <select name="status" defaultValue={status}>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button button--small">
          Search
        </button>
        {query.q || query.project || query.status ? (
          <a className="button button--ghost button--small" href="/finance/ledgers">
            Clear
          </a>
        ) : null}
      </form>

      <Card title={`Buyers (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState>No buyer matches.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th>Project and unit</th>
                  <th>Bought on</th>
                  <th>Plan</th>
                  <th>Ends</th>
                  <th>Instalments paid</th>
                  <th className="num">Received</th>
                  <th className="num">Still owed</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ sale, projectName, summary }) => (
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
                    <td>{formatDate(sale.date)}</td>
                    <td>
                      {summary.months / 12} {summary.months === 12 ? "year" : "years"}
                      <div className="muted">{summary.downPercent}% down</div>
                    </td>
                    <td>{summary.endDate ? formatDate(summary.endDate) : "On possession"}</td>
                    <td>
                      {summary.paidCount} of {summary.totalCount}
                    </td>
                    <td className="num">{formatMoney(summary.received)}</td>
                    <td className="num">{formatMoney(summary.owed)}</td>
                    <td>
                      <Badge tone={sale.status === "booked" ? "warning" : "success"}>{sale.status === "booked" ? "running" : "fully paid"}</Badge>
                    </td>
                    <td>
                      <Link href={`/finance/ledgers/${sale.id}`} className="button button--small">
                        Open ledger
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
