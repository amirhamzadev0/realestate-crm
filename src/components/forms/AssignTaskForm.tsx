import { ActionForm } from "@/components/forms/ActionForm";
import type { Worker } from "@/models/hr";

export function AssignTaskForm({ projectId, workers }: { projectId: string; workers: Worker[] }) {
  return (
    <ActionForm
      operation="assignTask"
      submitLabel="Assign task"
      hidden={{ projectId }}
      fields={[
        {
          name: "workerId",
          label: "Assign to",
          type: "select",
          required: true,
          options: workers.map((w) => ({ value: w.id, label: `${w.name} - ${w.role}` })),
        },
        { name: "task", label: "Task", type: "text", required: true },
        { name: "dueDate", label: "Due date", type: "date", required: true },
      ]}
    />
  );
}
