import { ApprovalActions } from "@/components/forms/ApprovalActions";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageHeader";
import type { ChangeRequestView } from "@/models/changes";
import { formatDate } from "@/utils/format";

/** Add / edit / remove requests for people. `approve` is the Super Admin view. */
export function ChangeRequestTable({
  requests,
  mode = "view",
}: {
  requests: ChangeRequestView[];
  mode?: "view" | "approve";
}) {
  if (requests.length === 0) return <EmptyState>Nothing here.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>From</th>
            <th>Change</th>
            <th>Status</th>
            <th>{mode === "approve" ? "Action" : "Decision note"}</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td>{formatDate(request.createdAt)}</td>
              <td>
                {request.projectName}
                <div className="muted">{request.requestedBy}</div>
              </td>
              <td>
                <Badge tone={request.action === "remove" ? "danger" : request.action === "add" ? "success" : "info"}>
                  {request.action}
                </Badge>{" "}
                {request.summary}
              </td>
              <td>
                <Badge>{request.status}</Badge>
              </td>
              <td>
                {mode === "approve" ? (
                  <ApprovalActions requestId={request.id} operation="decideChangeRequest" />
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
