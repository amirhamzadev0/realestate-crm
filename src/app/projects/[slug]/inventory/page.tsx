import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MaterialRequestForm } from "@/components/forms/MaterialRequestForm";
import { UsageForm } from "@/components/forms/UsageForm";
import { RequestTable } from "@/components/inventory/RequestTable";
import { StockTable } from "@/components/inventory/StockTable";
import { Card, StatCard } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDate, formatNumber } from "@/utils/format";
import { getProjectInventory } from "@/viewmodels/project.viewmodel";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await getProjectInventory((await params).slug);
  if (!data) notFound();
  const { project, stock, requests, materials } = data;
  const rejected = requests.filter((r) => r.status === "rejected");

  return (
    <>
      <PageHeader title="Inventory" subtitle={`${project.name} - material stocked and used`} />
      {rejected.length > 0 ? (
        <section className="notice notice--danger" role="status">
          <strong>{rejected.length === 1 ? "1 request was rejected" : `${rejected.length} requests were rejected`}</strong>
          <ul>
            {rejected.slice(0, 5).map((r) => (
              <li key={r.id}>
                {formatNumber(r.quantity)} {r.unit} of {r.materialName}
                {r.decidedAt ? ` (${formatDate(r.decidedAt)})` : ""}: {r.decisionNote || "no reason given"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="grid grid--3">
        <StatCard label="Materials available" value={String(stock.filter((s) => s.quantity > 0).length)} />
        <StatCard label="Running low" value={String(stock.filter((s) => s.low).length)} tone={stock.some((s) => s.low) ? "negative" : "default"} />
        <StatCard label="On order, waiting to arrive" value={String(requests.filter((r) => r.status === "ordered").length)} />
      </div>
      <Card title="Current inventory (available on site now)">
        <StockTable stock={stock} />
      </Card>
      <div className="grid grid--2">
        <Card title="Record material used">
          <UsageForm projectId={project.id} stock={stock} />
        </Card>
        <Card title="Request new material">
          <MaterialRequestForm projectId={project.id} requestedBy={project.adminName} materials={materials} />
        </Card>
      </div>
      <Card title="Your requests and orders (press Mark received when ordered material arrives; it is then added to the inventory above)">
        <RequestTable requests={requests} showProject={false} mode="receive" />
      </Card>
    </>
  );
}
