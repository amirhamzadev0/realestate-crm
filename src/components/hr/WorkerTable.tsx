import { ActionButton } from "@/components/forms/ActionButton";
import { WorkerEditForm } from "@/components/forms/WorkerForm";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageHeader";
import type { WorkerView } from "@/models/hr";
import { formatMoney, phoneHref } from "@/utils/format";

export function WorkerTable({ workers, pendingIds }: { workers: WorkerView[]; pendingIds: string[] }) {
  if (workers.length === 0) return <EmptyState>No staff on this project yet.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Role</th>
            <th className="num">Pay rate</th>
            <th className="num">Days this month</th>
            <th className="num">Earned</th>
            <th>Current work</th>
            <th>Change (needs Super Admin approval)</th>
          </tr>
        </thead>
        <tbody>
          {workers.map((worker) => {
            const open = worker.tasks.filter((t) => t.status !== "done");
            const pending = pendingIds.includes(worker.id);
            return (
              <tr key={worker.id}>
                <td>
                  {worker.name}
                  {worker.phone ? (
                    <div>
                      <a className="muted" href={phoneHref(worker.phone)}>
                        {worker.phone}
                      </a>
                    </div>
                  ) : null}
                </td>
                <td>
                  <Badge tone={worker.type === "employee" ? "info" : "neutral"}>{worker.type}</Badge>
                </td>
                <td>{worker.role}</td>
                <td className="num">
                  {worker.type === "employee" ? `${formatMoney(worker.monthlySalary)} / month` : `${formatMoney(worker.dailyWage)} / day`}
                </td>
                <td className="num">{worker.daysWorked}</td>
                <td className="num">{formatMoney(worker.earned)}</td>
                <td>{open.length ? open.map((t) => t.task).join("; ") : <span className="muted">Unassigned</span>}</td>
                <td>
                  {pending ? (
                    <Badge tone="warning">change pending</Badge>
                  ) : (
                    <div className="row-actions">
                      <details className="row-edit">
                        <summary className="button button--ghost button--small">Edit</summary>
                        <WorkerEditForm worker={worker} />
                      </details>
                      <ActionButton
                        operation="requestPersonChange"
                        body={{ kind: "worker", action: "remove", targetId: worker.id }}
                        label="Request removal"
                        variant="danger"
                        confirm={`Ask the Super Admin to remove ${worker.name}?`}
                      />
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
