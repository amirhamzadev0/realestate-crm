import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import type { SalesManager } from "@/models/sales";

function fields(manager?: SalesManager): FieldSpec[] {
  const list: FieldSpec[] = [
    { name: "name", label: "Name", type: "text", required: true, defaultValue: manager?.name },
    { name: "phone", label: "Phone", type: "text", defaultValue: manager?.phone },
    { name: "email", label: "Email", type: "text", defaultValue: manager?.email },
  ];
  if (manager) {
    list.push({
      name: "active",
      label: "Status",
      type: "select",
      required: true,
      defaultValue: String(manager.active),
      options: [
        { value: "true", label: "Active" },
        { value: "false", label: "Inactive" },
      ],
    });
  }
  return list;
}

/** The Super Admin creates the manager who will run the sales department. */
export function NewSalesManagerForm() {
  return (
    <ActionForm
      operation="createSalesManager"
      submitLabel="Create sales manager"
      successMessage="Sales manager created. They can now create agents and record sales."
      fields={fields()}
    />
  );
}

export function SalesManagerEditForm({ manager }: { manager: SalesManager }) {
  return (
    <ActionForm
      operation="updateSalesManager"
      submitLabel="Save sales manager"
      successMessage="Sales manager updated."
      hidden={{ id: manager.id }}
      fields={fields(manager)}
    />
  );
}
