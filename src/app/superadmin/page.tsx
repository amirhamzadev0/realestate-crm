import type { Metadata } from "next";
import Link from "next/link";
import { NewWarehouseItemForm } from "@/components/forms/NewWarehouseItemForm";
import { ReceiveStockForm } from "@/components/forms/ReceiveStockForm";
import { PayrollTable } from "@/components/hr/PayrollTable";
import { ChangeRequestTable } from "@/components/people/ChangeRequestTable";
import { RequestTable } from "@/components/inventory/RequestTable";
import { StockTable } from "@/components/inventory/StockTable";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { SalesReportCards } from "@/components/sales/SalesReportCards";
import { Card, StatCard } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatCompactMoney } from "@/utils/format";
import { getSuperAdminDashboard } from "@/viewmodels/superadmin.viewmodel";

export const metadata: Metadata = { title: "Super Admin" };

export default async function SuperAdminPage() {
  const data = await getSuperAdminDashboard();

  return (
    <>
      <PageHeader title="Overview" subtitle="Everything across all your projects" />

      <div className="grid grid--4">
        <StatCard label="Projects" value={String(data.totals.projects)} />
        <StatCard
          label="Combined balance"
          value={formatCompactMoney(data.totals.balance)}
          tone={data.totals.balance >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Staff on sites" value={String(data.totals.workers)} />
        <StatCard label="Awaiting your approval" value={String(data.pendingRequests.length + data.pendingPeople.length)} tone={data.pendingRequests.length + data.pendingPeople.length ? "negative" : "default"} />
      </div>

      <Card
        title="Material requests waiting"
        action={
          <Link href="/superadmin/approvals" className="link">
            Review all
          </Link>
        }
      >
        <RequestTable requests={data.pendingRequests} mode="approve" />
      </Card>

      <Card title="People changes waiting">
        <ChangeRequestTable requests={data.pendingPeople} mode="approve" />
      </Card>

      <Card title="Salaries waiting to be paid">
        <PayrollTable items={data.pendingPayroll} mode="pending" canPay projectNames={data.projectNames} />
      </Card>

      <h2 className="section-title">Projects</h2>
      <div className="grid grid--3">
        {data.rows.map(({ project, accounts, hr, unitsSold, soldByCategory }) => (
          <ProjectCard key={project.id} project={project} accounts={accounts} hr={hr} unitsSold={unitsSold} soldByCategory={soldByCategory} href={`/projects/${project.slug}`} />
        ))}
      </div>

      <h2 className="section-title">Sales</h2>
      <SalesReportCards report={data.sales} />

      <h2 className="section-title">Warehouse</h2>
      <Card
        title="Warehouse stock"
        action={
          <Link href="/warehouse" className="link">
            Open warehouse
          </Link>
        }
      >
        <StockTable stock={data.warehouseStock} showUsed={false} />
      </Card>
      <div className="grid grid--2">
        <Card title="Add stock to an existing item">
          <ReceiveStockForm materials={data.materials} successMessage="Stock added to the warehouse." />
        </Card>
        <Card title="Add a new item to the warehouse">
          <NewWarehouseItemForm />
        </Card>
      </div>
    </>
  );
}
