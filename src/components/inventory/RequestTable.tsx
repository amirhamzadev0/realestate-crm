import { MaterialApprovalActions } from "@/components/forms/MaterialApprovalActions";
import { ActionButton } from "@/components/forms/ActionButton";
import { DeliveryActions } from "@/components/forms/DeliveryActions";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageHeader";
import type { MaterialRequestView } from "@/models/inventory";
import { formatDate, formatMoney, formatNumber } from "@/utils/format";

/** `approve`: super admin decides. `deliver`: the order desk marks it delivered (or the Super Admin cancels it). `receive`: the project manager marks it received. `view`: read only. */
export function RequestTable({
  requests,
  mode = "view",
  canCancel = false,
  showProject = true,
}: {
  requests: MaterialRequestView[];
  mode?: "view" | "approve" | "deliver" | "receive";
  /** In `deliver` mode: whether the viewer may also cancel the order (the Super Admin). */
  canCancel?: boolean;
  showProject?: boolean;
}) {
  if (requests.length === 0) return <EmptyState>Nothing here.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            {showProject ? <th>Project</th> : null}
            <th>Material</th>
            <th className="num">Quantity</th>
            <th>Requested by</th>
            <th>Status</th>
            <th>{mode === "view" || mode === "receive" ? "Decision note / action" : "Action"}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td>{formatDate(request.createdAt)}</td>
              {showProject ? <td>{request.projectName}</td> : null}
              <td>
                {request.materialName}
                {request.vendor ? (
                  <div className="muted">
                    {request.status === "ordered" ? "Ordered" : "Order"} from {request.vendor}
                    {request.orderedAt ? ` on ${formatDate(request.orderedAt)}` : ""}
                    {request.totalAmount !== undefined ? ` - ${formatMoney(request.totalAmount)}` : ""}
                    {request.totalAmount !== undefined
                      ? request.balanceDue > 0
                        ? `, paid ${formatMoney(request.amountPaid ?? 0)}, ${formatMoney(request.balanceDue)} left`
                        : ", paid in full"
                      : ""}
                  </div>
                ) : null}
              </td>
              <td className="num">
                {formatNumber(request.quantity)} {request.unit}
              </td>
              <td>
                {request.requestedBy}
                {request.note ? <div className="muted">{request.note}</div> : null}
              </td>
              <td>
                <Badge>{request.status}</Badge>
              </td>
              <td>
                {mode === "approve" ? (
                  <MaterialApprovalActions requestId={request.id} />
                ) : mode === "deliver" ? (
                  <DeliveryActions requestId={request.id} canCancel={canCancel} />
                ) : mode === "receive" && request.status === "ordered" ? (
                  <ActionButton operation="receiveMaterial" body={{ requestId: request.id }} label="Mark received" />
                ) : (
                  (request.decisionNote ?? "-")
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
