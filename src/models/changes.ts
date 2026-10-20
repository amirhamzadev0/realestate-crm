export type ChangeKind = "worker" | "agent";
export type ChangeAction = "add" | "edit" | "remove";
export type ChangeStatus = "pending" | "approved" | "rejected";

/** A request to add, edit or remove a person. Nothing changes until the Super Admin approves it. */
export interface ChangeRequest {
  id: string;
  kind: ChangeKind;
  action: ChangeAction;
  projectId: string | null; // workers only
  targetId: string | null; // null for "add"
  targetName: string;
  payload: Record<string, unknown> | null; // new values for add / edit
  requestedBy: string;
  createdAt: string;
  status: ChangeStatus;
  decisionNote?: string;
  decidedAt?: string;
}

export interface ChangeRequestView extends ChangeRequest {
  projectName: string;
  summary: string;
}
