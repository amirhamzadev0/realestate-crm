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
import { AccountSummaryCards } from "@/components/accounts/AccountSummaryCards";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
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

      <h2 className="section-title">Accounts of all projects combined</h2>
      <AccountSummaryCards summary={data.combined} />

      <h2 className="section-title">Instalments (units sold on a payment plan)</h2>
      <div className="grid grid--4">
        <StatCard label="Still to receive" value={formatCompactMoney(data.instalments.receivable)} hint={`${formatCompactMoney(data.instalments.collected)} received so far`} />
        <StatCard label="Overdue" value={formatCompactMoney(data.instalments.overdue.amount)} tone={data.instalments.overdue.count ? "negative" : "default"} hint={`${data.instalments.overdue.count} instalments`} />
        <StatCard label="Due today" value={formatCompactMoney(data.instalments.dueToday.amount)} hint={`${data.instalments.dueToday.count} instalments`} />
        <StatCard label="Units booked (plans running)" value={String(data.instalments.bookedUnits)} hint={`${data.instalments.needFollowUp} need a follow-up`} />
      </div>
      <p>
        <Link href="/finance" className="link">
          Open Finance
        </Link>
      </p>

      <h2 className="section-title">Payments pending</h2>
      <div className="grid grid--3">
        <StatCard label="Owed to vendors" value={formatCompactMoney(data.owed.vendorTotal)} tone={data.owed.vendorTotal ? "negative" : "default"} hint={`${data.owed.vendors.length} vendors`} />
        <StatCard label="Salaries and work payments due" value={formatCompactMoney(data.owed.peopleTotal)} tone={data.owed.peopleTotal ? "negative" : "default"} hint={`${data.owed.people.length} people`} />
        <StatCard label="Total to pay" value={formatCompactMoney(data.owed.vendorTotal + data.owed.peopleTotal)} tone={data.owed.vendorTotal + data.owed.peopleTotal ? "negative" : "default"} />
      </div>
      <div className="grid grid--2">
        <Card title="Who is waiting for payment: vendors">
          {data.owed.vendors.length === 0 ? (
            <EmptyState>No vendor is waiting for money.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Vendor</th>
                    <th className="num">Orders</th>
                    <th className="num">Balance due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.owed.vendors.map((v) => (
                    <tr key={v.name}>
                      <td>{v.name}</td>
                      <td className="num">{v.orders}</td>
                      <td className="num">{formatMoney(v.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Who is waiting for payment: staff and labour">
          {data.owed.people.length === 0 ? (
            <EmptyState>No salary or work payment is due.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Project</th>
                    <th className="num">Payments</th>
                    <th className="num">Amount due</th>
                  </tr>
                </thead>
                <tbody>
                  {data.owed.people.map((p) => (
                    <tr key={`${p.name}|${p.project}`}>
                      <td>{p.name}</td>
                      <td>{p.project}</td>
                      <td className="num">{p.items}</td>
                      <td className="num">{formatMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card title="Each project: credit, debit and balance">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th className="num">Credit</th>
                <th className="num">Debit</th>
                <th className="num">Expenses</th>
                <th className="num">Sales</th>
                <th className="num">Purchases</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(({ project, accounts }) => (
                <tr key={project.id}>
                  <td>
                    <Link href={`/projects/${project.slug}/accounts`} className="link">
                      {project.name}
                    </Link>
                  </td>
                  <td className="num">{formatMoney(accounts.credit)}</td>
                  <td className="num">{formatMoney(accounts.debit)}</td>
                  <td className="num">{formatMoney(accounts.expense)}</td>
                  <td className="num">{formatMoney(accounts.sales)}</td>
                  <td className="num">{formatMoney(accounts.purchase)}</td>
                  <td className="num">{formatMoney(accounts.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
      {data.onOrder.some((o) => o.receivedQuantity > 0) ? (
        <section className="notice notice--warning" role="status">
          <strong>Some orders arrived in parts:</strong>
          <span>
            {" "}
            {data.onOrder
              .filter((o) => o.receivedQuantity > 0)
              .map((o) => `${o.projectName}, ${o.materialName}: ${o.receivedQuantity} arrived, ${o.remainingQuantity} ${o.unit} still to come`)
              .join(" | ")}
          </span>
        </section>
      ) : null}
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
