import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import type { Agent } from "@/models/sales";

function fields(agent?: Agent): FieldSpec[] {
  return [
    { name: "name", label: "Name", type: "text", required: true, defaultValue: agent?.name },
    { name: "phone", label: "Phone", type: "text", defaultValue: agent?.phone },
    {
      name: "commissionRate",
      label: "Commission %",
      type: "number",
      required: true,
      defaultValue: String(agent?.commissionRate ?? 2),
      step: "0.1",
    },
  ];
}

export function AgentForm() {
  return (
    <ActionForm
      operation="requestPersonChange"
      submitLabel="Send add request to Super Admin"
      successMessage="Request sent. The agent is added once the Super Admin approves."
      hidden={{ kind: "agent", action: "add" }}
      payloadKey="payload"
      fields={fields()}
    />
  );
}

export function AgentEditForm({ agent }: { agent: Agent }) {
  return (
    <ActionForm
      operation="requestPersonChange"
      submitLabel="Send edit request to Super Admin"
      successMessage="Edit request sent for approval."
      hidden={{ kind: "agent", action: "edit", targetId: agent.id }}
      payloadKey="payload"
      fields={fields(agent)}
    />
  );
}
