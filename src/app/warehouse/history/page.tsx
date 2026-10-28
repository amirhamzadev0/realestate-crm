import type { Metadata } from "next";
import Link from "next/link";
import { ProjectFilter } from "@/components/inventory/ProjectFilter";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { formatDate, formatMonth, formatMoney } from "@/utils/format";
import type { OrderEventKind } from "@/utils/order-events";
import { getOrdersHistory } from "@/viewmodels/warehouse.viewmodel";

const eventLabel: Record<OrderEventKind, string> = { requested: "Requested", ordered: "Ordered", delivered: "Received", paid: "Paid", rejected: "Rejected" };

export const metadata: Metadata = { title: "Order records" };

/** Every delivered and rejected order, month by month. A month opens its full list, and each month can be downloaded. */
export default async function OrderHistoryPage({ searchParams }: { searchParams: Promise<{ month?: string; project?: string }> }) {
  const query = await searchParams;
  const { projects, project, months, selected, rows, all } = await getOrdersHistory(query.month, query.project);
  const projectQuery = project ? `&project=${project.slug}` : "";
  const download = (month: string) => `/reports/orders-month?month=${month}${projectQuery}`;

  return (
    <>
      <PageHeader
        title="Order records"
        subtitle="What happened to every request and order, month by month: when it was requested, ordered, received (even in parts), paid for or rejected. An order placed on the 29th and received on the 5th shows in both months. Pick a project to see only its records."
        actions={
          <Link href="/warehouse" className="button button--ghost">
            Back to orders
          </Link>
        }
      />

      <div className="inline-form">
        <ProjectFilter projects={projects.map((p) => ({ slug: p.slug, name: p.name }))} current={project?.slug ?? ""} month={selected} />
        <a className="button button--ghost button--small" href={download("all")}>
          Download {project ? project.name : "everything"} ({all.length})
        </a>
      </div>

      <Card title={`Months${project ? ` of ${project.name}` : ""}`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Requested</th>
                <th className="num">Ordered</th>
                <th className="num">Deliveries</th>
                <th className="num">Paid to vendors</th>
                <th className="num">Rejected</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className={m.month === selected ? "lead-row--highlight" : undefined}>
                  <td>
                    <Link href={`/warehouse/history?month=${m.month}${projectQuery}`} className="link">
                      {formatMonth(m.month)}
                    </Link>
                  </td>
                  <td className="num">{m.requested}</td>
                  <td className="num">{m.ordered}</td>
                  <td className="num">{m.deliveries}</td>
                  <td className="num">{formatMoney(m.paid)}</td>
                  <td className="num">{m.rejected}</td>
                  <td>
                    <a className="button button--ghost button--small" href={download(m.month)}>
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {selected ? (
        <Card
          title={`${formatMonth(selected)}: ${rows.length} ${rows.length === 1 ? "event" : "events"}`}
          action={
            <a className="button button--small" href={download(selected)}>
              Download this month
            </a>
          }
        >
          {rows.length === 0 ? (
            <EmptyState>Nothing happened to any order in this month.</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    {project ? null : <th>Project</th>}
                    <th>Material</th>
                    <th>What happened</th>
                    <th>Order now</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((event, index) => (
                    <tr key={`${event.request.id}-${event.kind}-${index}`}>
                      <td>{formatDate(event.date)}</td>
                      {project ? null : <td>{event.request.projectName}</td>}
                      <td>{event.request.materialName}</td>
                      <td>
                        <Badge tone={event.kind === "rejected" ? "danger" : event.kind === "paid" ? "info" : undefined}>{eventLabel[event.kind]}</Badge>
                        <div>{event.text}</div>
                      </td>
                      <td>
                        <Badge>{event.request.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </>
  );
}
