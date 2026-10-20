import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import type { Worker } from "@/models/hr";

function fields(worker?: Worker): FieldSpec[] {
  return [
    { name: "name", label: "Name", type: "text", required: true, defaultValue: worker?.name },
    {
      name: "type",
      label: "Type",
      type: "select",
      required: true,
      defaultValue: worker?.type,
      options: [
        { value: "employee", label: "Employee (monthly salary)" },
        { value: "labour", label: "Labour (daily wage)" },
      ],
    },
    { name: "role", label: "Role / trade", type: "text", required: true, defaultValue: worker?.role },
    { name: "phone", label: "Phone", type: "text", defaultValue: worker?.phone },
    { name: "monthlySalary", label: "Monthly salary (employees)", type: "number", defaultValue: worker?.monthlySalary ? String(worker.monthlySalary) : undefined },
    { name: "dailyWage", label: "Daily wage (labour)", type: "number", defaultValue: worker?.dailyWage ? String(worker.dailyWage) : undefined },
  ];
}

/** Requests adding a person. The Super Admin must approve before they appear. */
export function WorkerForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm
      operation="requestPersonChange"
      submitLabel="Send add request to Super Admin"
      successMessage="Request sent. The person is added once the Super Admin approves."
      hidden={{ kind: "worker", action: "add", projectId }}
      payloadKey="payload"
      fields={fields()}
    />
  );
}

/** Requests changes to an existing person. */
export function WorkerEditForm({ worker }: { worker: Worker }) {
  return (
    <ActionForm
      operation="requestPersonChange"
      submitLabel="Send edit request to Super Admin"
      successMessage="Edit request sent for approval."
      hidden={{ kind: "worker", action: "edit", targetId: worker.id }}
      payloadKey="payload"
      fields={fields(worker)}
    />
  );
}
