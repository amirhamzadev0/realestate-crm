import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import type { Agent, SalesManager } from "@/models/sales";

function fields(managers: SalesManager[], agent?: Agent): FieldSpec[] {
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
    {
      name: "managerId",
      label: "Sales manager (whose team)",
      type: "select",
      required: true,
      defaultValue: agent?.managerId ?? undefined,
      options: managers.map((m) => ({ value: m.id, label: m.name })),
    },
  ];
}

/** The sales manager creates an agent straight away; no approval is needed. */
export function AgentForm({ managers }: { managers: SalesManager[] }) {
  return (
    <ActionForm
      operation="createAgent"
      submitLabel="Create agent"
      successMessage="Agent created. They can see their own portal."
      fields={fields(managers)}
    />
  );
}

export function AgentEditForm({ agent, managers }: { agent: Agent; managers: SalesManager[] }) {
  return (
    <ActionForm
      operation="updateAgent"
      submitLabel="Save agent"
      successMessage="Agent updated."
      hidden={{ id: agent.id }}
      fields={fields(managers, agent)}
    />
  );
}
