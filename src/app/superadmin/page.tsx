import type { Metadata } from "next";
import Link from "next/link";
import { NewMaterialForm } from "@/components/forms/NewMaterialForm";
import { OrderMaterialForm } from "@/components/forms/OrderMaterialForm";
import { PayrollTable } from "@/components/hr/PayrollTable";
import { ChangeRequestTable } from "@/components/people/ChangeRequestTable";
import { PaymentsDueTable } from "@/components/inventory/PaymentsDueTable";
import { RequestTable } from "@/components/inventory/RequestTable";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { SalesReportCards } from "@/components/sales/SalesReportCards";
import { Card, StatCard } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatCompactMoney, formatMoney } from "@/utils/format";
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

      <h2 className="section-title">Material orders</h2>
      {data.paymentsDue.length > 0 ? (
        <section className="notice notice--warning" role="status">
          <strong>
            {data.paymentsDue.length === 1 ? "1 delivered order is waiting for payment" : `${data.paymentsDue.length} delivered orders are waiting for payment`}
          </strong>
          <span>
            {" "}
            - {formatMoney(data.paymentsDue.reduce((sum, order) => sum + order.balanceDue, 0))} to send to vendors (see below).
          </span>
        </section>
      ) : null}
      <Card title={`Delivered, balance to send to vendors (${data.paymentsDue.length})`}>
        <PaymentsDueTable orders={data.paymentsDue} canPay />
      </Card>
      <Card title={`Received at the projects, last 14 days (${data.recentlyReceived.length})`}>
        <RequestTable requests={data.recentlyReceived} />
      </Card>
      <Card
        title={`On order, waiting to arrive (${data.onOrder.length})`}
        action={
          <Link href="/warehouse" className="link">
            Open orders
          </Link>
        }
      >
        <RequestTable requests={data.onOrder} mode="deliver" canCancel />
      </Card>
      <div className="grid grid--2">
        <Card title="Order material for a project">
          <OrderMaterialForm projects={data.projects} materials={data.materials} />
        </Card>
        <Card title="Add a material to the list">
          <NewMaterialForm />
        </Card>
      </div>
    </>
  );
}
