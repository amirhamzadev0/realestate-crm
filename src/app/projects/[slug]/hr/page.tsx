import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssignTaskForm } from "@/components/forms/AssignTaskForm";
import { WorkerForm } from "@/components/forms/WorkerForm";
import { AssignedWorkTable, CompletedWorkTable } from "@/components/hr/AssignmentTable";
import { PayrollTable } from "@/components/hr/PayrollTable";
import { ChangeRequestTable } from "@/components/people/ChangeRequestTable";
import { WorkerTable } from "@/components/hr/WorkerTable";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/server/auth/session";
import { today } from "@/utils/id";
import { formatCompactMoney, formatDate, formatMoney } from "@/utils/format";
import { getProjectHr } from "@/viewmodels/project.viewmodel";

export const metadata: Metadata = { title: "HR" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function HrPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { slug } = await params;
  const requested = (await searchParams).date;
  const date = requested && ISO_DATE.test(requested) ? requested : today();
  const data = await getProjectHr(slug, date);
  if (!data) notFound();
  const { project, summary, workers, assignments, changes, pendingIds, report, pending, paid } = data;
  // Salaries are handed over by the Super Admin; the project manager only sees what is owed.
  const canPay = (await getCurrentUser())?.role === "superadmin";
  const base = `/projects/${project.slug}/hr`;

  return (
    <>
      <PageHeader title="HR" subtitle={`${project.name} - staff, work and salaries`} />
      <div className="grid grid--4">
        <StatCard label="Employees" value={String(summary.employees)} />
        <StatCard label="Labour" value={String(summary.labour)} />
        <StatCard label="Payroll paid this month" value={formatCompactMoney(summary.monthlyPayroll)} hint="Only salaries already handed over" />
        <StatCard
          label="Pending salaries"
          value={formatCompactMoney(summary.pendingPayroll)}
          tone={summary.pendingCount ? "negative" : "default"}
          hint={`${summary.pendingCount} waiting for the Super Admin`}
        />
      </div>
      <Card title="Staff and labour">
        <WorkerTable workers={workers} pendingIds={pendingIds} />
      </Card>
      <div className="grid grid--2">
        <Card title="Request a new employee or labour">
          <WorkerForm projectId={project.id} />
        </Card>
        <Card title="Assign work">
          <AssignTaskForm projectId={project.id} workers={workers} />
        </Card>
      </div>
      <Card title="Add / edit / removal requests sent to Super Admin">
        <ChangeRequestTable requests={changes} />
      </Card>
      <Card title="Work assigned">
        <AssignedWorkTable assignments={assignments.filter((a) => a.status !== "done")} />
      </Card>

      <Card
        title={`Work completed on ${formatDate(report.date)}`}
        action={
          <form method="get" className="inline-form">
            <input type="date" name="date" defaultValue={report.date} max={today()} aria-label="Report date" />
            <button type="submit" className="button button--ghost button--small">
              Show day
            </button>
          </form>
        }
      >
        <CompletedWorkTable assignments={report.items} />
        {report.items.length ? <p className="muted">Total for the day: {formatMoney(report.total)}</p> : null}
      </Card>
      <Card title="Daily report">
        {report.days.length === 0 ? (
          <EmptyState>No work has been completed yet.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="num">Tasks completed</th>
                  <th className="num">Payment for the day</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {report.days.map((day) => (
                  <tr key={day.date}>
                    <td>{formatDate(day.date)}</td>
                    <td className="num">{day.count}</td>
                    <td className="num">{formatMoney(day.total)}</td>
                    <td>
                      <Link className="link" href={`${base}?date=${day.date}`}>
                        {day.date === report.date ? "Showing" : "View"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Pending salaries (monthly salaries after one month, and completed work)">
        <PayrollTable items={pending} mode="pending" canPay={canPay} />
      </Card>
      <Card title="Salaries paid">
        <PayrollTable items={paid} mode="paid" />
      </Card>
    </>
  );
}
