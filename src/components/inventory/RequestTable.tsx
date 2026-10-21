import { ApprovalActions } from "@/components/forms/ApprovalActions";
import { IssueActions } from "@/components/forms/IssueActions";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageHeader";
import type { MaterialRequestView } from "@/models/inventory";
import { formatDate, formatNumber } from "@/utils/format";

/** `approve`: super admin decides. `issue`: warehouse issues it from stock or rejects it. `view`: read only. */
export function RequestTable({
  requests,
  mode = "view",
  showProject = true,
}: {
  requests: MaterialRequestView[];
  mode?: "view" | "approve" | "issue";
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
            <th>{mode === "view" ? "Decision note" : "Action"}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td>{formatDate(request.createdAt)}</td>
              {showProject ? <td>{request.projectName}</td> : null}
              <td>{request.materialName}</td>
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
                  <ApprovalActions requestId={request.id} />
                ) : mode === "issue" ? (
                  <IssueActions requestId={request.id} />
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
