import Link from "next/link";
import { SaleForm, type SaleLead } from "@/components/forms/SaleForm";
import { ProjectSalesTable } from "@/components/sales/ProjectSalesTable";
import { Card, StatCard } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageHeader";
import { categoryLabels, saleUnit } from "@/models/project";
import type { SalesManager } from "@/models/sales";
import { formatCompactMoney, formatDate, formatMoney, formatNumber } from "@/utils/format";
import { getDirectSalesPage } from "@/viewmodels/superadmin.viewmodel";

/**
 * Choose a project, then sell one of its units straight to a buyer (with an optional discount). Used by the Super Admin and
 * by the sales manager: the manager passes `managers` so the sale is recorded under their name.
 */
export async function DirectSalesPanel({
  slug,
  basePath,
  managers,
  asAgent,
}: {
  slug?: string;
  basePath: string;
  managers?: SalesManager[];
  /** An agent's own sale page: the sale is theirs, to one of their leads, and only their own sales are listed. */
  asAgent?: { id: string; leads: SaleLead[]; defaultLeadId?: string };
}) {
  const { projects, selected } = await getDirectSalesPage(slug);
  // An agent sees only their own sales here, and the total of those, not the whole project's.
  const shownSales = selected && asAgent ? selected.sales.filter((s) => s.agentId === asAgent.id) : (selected?.sales ?? []);
  const shownRevenue = shownSales.reduce((sum, s) => sum + s.price, 0);

  return (
    <>
      <Card title="Choose a project">
        <div className="chips">
          {projects.map(({ project, unitsLeft }) => (
            <Link
              key={project.id}
              href={`${basePath}?project=${project.slug}${asAgent?.defaultLeadId ? `&lead=${asAgent.defaultLeadId}` : ""}`}
              className={`chip${selected?.project.id === project.id ? " chip--active" : ""}`}
            >
              {project.name} <span className="muted">({unitsLeft} left)</span>
            </Link>
          ))}
        </div>
      </Card>

      {!selected ? (
        <EmptyState>Select a project above to sell one of its units.</EmptyState>
      ) : (
        <>
          <div className="grid grid--4">
            <StatCard label="Type" value={selected.project.type === "high-rise" ? "High-rise" : "Land plotting"} />
            <StatCard
              label={`Plot types (${saleUnit[selected.project.type].rate})`}
              value={String(selected.project.rates.length)}
              hint={selected.project.rates.map((r) => `${categoryLabels[r.category]} ${formatCompactMoney(r.rate)}`).join(" · ") || "No price set"}
            />
            <StatCard
              label="Units available"
              value={`${selected.unitsLeft} / ${selected.project.totalUnits}`}
              tone={selected.unitsLeft === 0 ? "negative" : "default"}
              hint={`${selected.unitsSold} sold`}
            />
            <StatCard
              label={asAgent ? "My sales here" : "Credited to project"}
              value={formatCompactMoney(asAgent ? shownRevenue : selected.revenue)}
              tone="positive"
              hint={asAgent ? `${shownSales.length} sold by me` : "Total of its sales"}
            />
          </div>
          <Card title="Units by plot type">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Plot type</th>
                    <th className="num">Price {saleUnit[selected.project.type].rate}</th>
                    <th className="num">Total units</th>
                    <th className="num">Sold</th>
                    <th className="num">Left</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.categoryRows.map((row) => (
                    <tr key={row.category}>
                      <td>{categoryLabels[row.category]}</td>
                      <td className="num">{formatMoney(row.rate)}</td>
                      <td className="num">{row.units ?? "-"}</td>
                      <td className="num">{row.sold}</td>
                      <td className="num">{row.left ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {selected.floorRows.length ? (
            <Card title="Units by floor">
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Plot type</th>
                      <th>Floor</th>
                      <th className="num">Units</th>
                      <th className="num">Sold</th>
                      <th className="num">Free</th>
                      <th className="num">Sizes (sq ft)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.floorRows.map((row) => (
                      <tr key={`${row.category}|${row.floor}`}>
                        <td>{categoryLabels[row.category]}</td>
                        <td>{row.floor}</td>
                        <td className="num">{row.total}</td>
                        <td className="num">{row.sold}</td>
                        <td className="num">{row.free}</td>
                        <td className="num">
                          {Math.min(...row.area) === Math.max(...row.area)
                            ? formatNumber(row.area[0])
                            : `${formatNumber(Math.min(...row.area))} - ${formatNumber(Math.max(...row.area))}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
          {selected.unitRows.length ? (
            <Card title={`All units (${selected.unitRows.filter((u) => u.sale).length} sold, ${selected.unitRows.filter((u) => !u.sale).length} available)`}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Plot type</th>
                      <th>Floor</th>
                      <th>Unit</th>
                      <th className="num">Size (sq ft)</th>
                      <th>Status</th>
                      {asAgent ? null : <th>Sold on</th>}
                      {asAgent ? null : <th className="num">Price</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.unitRows.map((u) => (
                      <tr key={u.unit} className={u.sale ? "row--sold" : undefined}>
                        <td>{categoryLabels[u.category]}</td>
                        <td>{u.floor}</td>
                        <td>{u.unit}</td>
                        <td className="num">{formatNumber(u.area)}</td>
                        <td>
                          <Badge tone={u.sale ? "danger" : "success"}>{u.sale ? "sold" : "available"}</Badge>
                        </td>
                        {asAgent ? null : <td>{u.sale ? formatDate(u.sale.date) : "-"}</td>}
                        {asAgent ? null : <td className="num">{u.sale ? formatMoney(u.sale.price) : "-"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
          <Card title={`Sell a unit in ${selected.project.name}`}>
            {selected.unitsLeft === 0 ? (
              <EmptyState>All {selected.project.totalUnits} units are sold.</EmptyState>
            ) : selected.project.rates.length === 0 ? (
              <EmptyState>Set a price for at least one plot type first (Projects, Edit project).</EmptyState>
            ) : managers && managers.length === 0 ? (
              <EmptyState>The Super Admin has to create a sales manager first (Sales team).</EmptyState>
            ) : (
              <>
                <SaleForm
                  mode={asAgent ? "lead" : "direct"}
                  projects={[selected.saleProject!]}
                  fixedProjectId={selected.project.id}
                  managers={managers}
                  agentId={asAgent?.id}
                  leads={asAgent?.leads}
                  defaultLeadId={asAgent?.defaultLeadId}
                />
                <p className="muted">
                  Price = size x the price of the chosen plot type ({saleUnit[selected.project.type].rate}); you can give a discount as an amount, a lower
                  rate or a percentage. The unit comes off the available units and the amount the buyer pays is added to the project accounts as a
                  sale. Buyer name, phone, CNIC and email are all required.
                </p>
              </>
            )}
          </Card>
          <Card title={asAgent ? `My sales in ${selected.project.name}` : `Sales in ${selected.project.name}`}>
            <ProjectSalesTable project={selected.project} sales={shownSales} agentNames={selected.agentNames} />
          </Card>
        </>
      )}
    </>
  );
}
