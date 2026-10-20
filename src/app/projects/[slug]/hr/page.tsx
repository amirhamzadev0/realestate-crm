import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssignTaskForm } from "@/components/forms/AssignTaskForm";
import { WorkerForm } from "@/components/forms/WorkerForm";
import { AssignmentTable } from "@/components/hr/AssignmentTable";
import { ChangeRequestTable } from "@/components/people/ChangeRequestTable";
import { WorkerTable } from "@/components/hr/WorkerTable";
import { Card, StatCard } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatCompactMoney } from "@/utils/format";
import { getProjectHr } from "@/viewmodels/project.viewmodel";

export const metadata: Metadata = { title: "HR" };

export default async function HrPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await getProjectHr((await params).slug);
  if (!data) notFound();
  const { project, summary, workers, assignments, changes, pendingIds } = data;

  return (
    <>
      <PageHeader title="HR" subtitle={`${project.name} - staff, wages and work assignments`} />
      <div className="grid grid--3">
        <StatCard label="Employees" value={String(summary.employees)} />
        <StatCard label="Labour" value={String(summary.labour)} />
        <StatCard label="Payroll this month" value={formatCompactMoney(summary.monthlyPayroll)} hint="Salaries + daily wages x days present" />
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
      <Card title="Work assignments">
        <AssignmentTable assignments={assignments} />
      </Card>
    </>
  );
}
