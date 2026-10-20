import { ActionButton } from "@/components/forms/ActionButton";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageHeader";
import type { WorkAssignment } from "@/models/hr";
import { formatDate, formatMoney } from "@/utils/format";

type Row = WorkAssignment & { workerName: string };

/** Work the manager has handed out and that is not finished yet. */
export function AssignedWorkTable({ assignments }: { assignments: Row[] }) {
  if (assignments.length === 0) return <EmptyState>No work is assigned right now.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Assigned to</th>
            <th>Assigned on</th>
            <th>Due</th>
            <th className="num">Payment</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr key={a.id}>
              <td>{a.task}</td>
              <td>{a.workerName}</td>
              <td>{formatDate(a.assignedAt)}</td>
              <td>{formatDate(a.dueDate)}</td>
              <td className="num">{formatMoney(a.payment)}</td>
              <td>
                <Badge>{a.status}</Badge>
              </td>
              <td>
                <span className="row-actions">
                  {a.status === "todo" ? (
                    <ActionButton operation="setTaskStatus" body={{ id: a.id, status: "in-progress" }} label="In progress" variant="ghost" />
                  ) : (
                    <ActionButton operation="setTaskStatus" body={{ id: a.id, status: "done" }} label="Done" />
                  )}
                  <ActionButton
                    operation="cancelTask"
                    body={{ id: a.id }}
                    label="Cancel"
                    variant="danger"
                    confirm={`Cancel "${a.task}"? It will be removed.`}
                  />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Finished work. The payment of each row is part of the month's payroll. */
export function CompletedWorkTable({ assignments }: { assignments: Row[] }) {
  if (assignments.length === 0) return <EmptyState>No work has been completed yet.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Done by</th>
            <th>Assigned on</th>
            <th>Completed</th>
            <th className="num">Payment</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr key={a.id}>
              <td>{a.task}</td>
              <td>{a.workerName}</td>
              <td>{formatDate(a.assignedAt)}</td>
              <td>{a.completedAt ? formatDate(a.completedAt) : "-"}</td>
              <td className="num">{formatMoney(a.payment)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
