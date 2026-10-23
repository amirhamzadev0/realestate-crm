import type { Metadata } from "next";
import { SaleForm } from "@/components/forms/SaleForm";
import { SalesReportCards } from "@/components/sales/SalesReportCards";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { formatDate, formatMoney, formatNumber } from "@/utils/format";
import { getSalesReportPage } from "@/viewmodels/sales.viewmodel";

export const metadata: Metadata = { title: "Sales & Commission" };

export default async function SalesReportPage() {
  const { report, sales, projects, sellers } = await getSalesReportPage();

  return (
    <>
      <PageHeader title="Sales and commission" subtitle="Every sale with the commission owed to the agent" />
      <SalesReportCards report={report} />
      <Card title="Record a sale">
        <SaleForm mode="agent" projects={projects} sellers={sellers} />
      </Card>
      <Card title="Sales report">
        {sales.length === 0 ? (
          <EmptyState>No sales yet.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Unit / plot</th>
                  <th>Floor</th>
                  <th className="num">Area</th>
                  <th className="num">Rate</th>
                  <th>Agent</th>
                  <th className="num">Price</th>
                  <th className="num">Commission</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{formatDate(sale.date)}</td>
                    <td>{sale.projectName}</td>
                    <td>{sale.unit}</td>
                    <td>{sale.floor ?? "-"}</td>
                    <td className="num">
                      {formatNumber(sale.area)} {sale.areaUnit}
                    </td>
                    <td className="num">{formatMoney(sale.rate)}</td>
                    <td>{sale.agentName}</td>
                    <td className="num">{formatMoney(sale.price)}</td>
                    <td className="num">
                      <Badge tone="info">{formatMoney(sale.commission)}</Badge>
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
