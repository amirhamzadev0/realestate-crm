import type { Metadata } from "next";
import Link from "next/link";
import { SaleForm } from "@/components/forms/SaleForm";
import { ProjectSalesTable } from "@/components/sales/ProjectSalesTable";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { categoryLabels, saleUnit } from "@/models/project";
import { formatCompactMoney, formatMoney, formatNumber } from "@/utils/format";
import { getDirectSalesPage } from "@/viewmodels/superadmin.viewmodel";

export const metadata: Metadata = { title: "Direct sales" };

export default async function DirectSalesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { projects, selected } = await getDirectSalesPage((await searchParams).project);

  return (
    <>
      <PageHeader title="Direct sales" subtitle="Choose a project and sell a unit yourself, without an agent" />
      <Card title="Choose a project">
        <div className="chips">
          {projects.map(({ project, unitsLeft }) => (
            <Link
              key={project.id}
              href={`/superadmin/direct-sales?project=${project.slug}`}
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
            <StatCard label="Credited to project" value={formatCompactMoney(selected.revenue)} tone="positive" hint="Total of its sales" />
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
          <Card title={`Sell a unit in ${selected.project.name}`}>
            {selected.unitsLeft === 0 ? (
              <EmptyState>All {selected.project.totalUnits} units are sold.</EmptyState>
            ) : selected.project.rates.length === 0 ? (
              <EmptyState>Set a price for at least one plot type first (Projects, Edit project).</EmptyState>
            ) : (
              <>
                <SaleForm mode="direct" projects={[selected.saleProject!]} fixedProjectId={selected.project.id} />
                <p className="muted">
                  Price = size x the price of the chosen plot type ({saleUnit[selected.project.type].rate}); you can give a discount as an amount, a lower
                  rate or a percentage. The unit comes off the available units and the amount the buyer pays is added to the project accounts as a
                  sale. Buyer name, phone, CNIC and email are all required.
                </p>
              </>
            )}
          </Card>
          <Card title={`Sales in ${selected.project.name}`}>
            <ProjectSalesTable project={selected.project} sales={selected.sales} agentNames={selected.agentNames} />
          </Card>
        </>
      )}
    </>
  );
}
