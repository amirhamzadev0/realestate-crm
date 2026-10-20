import { ActionButton } from "@/components/forms/ActionButton";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageHeader";
import type { PayrollItem } from "@/models/hr";
import { formatDate, formatMoney } from "@/utils/format";

/**
 * `pending`: money owed. With `canPay` (Super Admin) each row has a Pay button.
 * `paid`: what has already been handed over.
 */
export function PayrollTable({
  items,
  mode,
  canPay = false,
  projectNames,
}: {
  items: PayrollItem[];
  mode: "pending" | "paid";
  canPay?: boolean;
  /** Shown as a Project column when the list spans several projects. */
  projectNames?: Record<string, string>;
}) {
  if (items.length === 0) {
    return <EmptyState>{mode === "pending" ? "No pending salaries." : "Nothing has been paid yet."}</EmptyState>;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {projectNames ? <th>Project</th> : null}
            <th>Person</th>
            <th>For</th>
            <th>{mode === "pending" ? "Due since" : "Paid on"}</th>
            <th className="num">Amount</th>
            {mode === "pending" && canPay ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.projectId}:${item.workerId}:${item.kind}:${item.ref}`}>
              {projectNames ? <td>{projectNames[item.projectId] ?? item.projectId}</td> : null}
              <td>
                {item.workerName} <Badge tone={item.workerType === "employee" ? "info" : "neutral"}>{item.workerType}</Badge>
              </td>
              <td>{item.description}</td>
              <td>{formatDate(mode === "pending" ? item.dueDate : (item.paidAt ?? item.dueDate))}</td>
              <td className="num">{formatMoney(item.amount)}</td>
              {mode === "pending" && canPay ? (
                <td>
                  <ActionButton
                    operation="payPayroll"
                    body={{ projectId: item.projectId, workerId: item.workerId, kind: item.kind, ref: item.ref }}
                    label="Pay"
                    confirm={`Pay ${formatMoney(item.amount)} to ${item.workerName}?`}
                  />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
