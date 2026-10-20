import { StatusSelect } from "@/components/forms/StatusSelect";
import { EmptyState } from "@/components/ui/PageHeader";
import type { WorkAssignment } from "@/models/hr";
import { formatDate } from "@/utils/format";

export function AssignmentTable({ assignments }: { assignments: (WorkAssignment & { workerName: string })[] }) {
  if (assignments.length === 0) return <EmptyState>No tasks assigned.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Assigned to</th>
            <th>Due</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr key={a.id}>
              <td>{a.task}</td>
              <td>{a.workerName}</td>
              <td>{formatDate(a.dueDate)}</td>
              <td>
                <StatusSelect operation="setTaskStatus" id={a.id} value={a.status} options={["todo", "in-progress", "done"]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
