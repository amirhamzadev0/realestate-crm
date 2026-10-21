import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import type { Manager, ManagerView } from "@/models/manager";
import { ProjectSetupForm } from "@/components/forms/ProjectSetupForm";
import type { Project } from "@/models/project";

export function NewProjectForm({ managers }: { managers: ManagerView[] }) {
  return <ProjectSetupForm managers={managers} />;
}

/** Edits details, prices, floors and can hand the project to another manager (or leave it without one). */
export function ProjectEditForm({ project, managers }: { project: Project; managers: ManagerView[] }) {
  return <ProjectSetupForm key={JSON.stringify(project)} project={project} managers={managers} />;
}

function managerFields(manager?: Manager): FieldSpec[] {
  const fields: FieldSpec[] = [
    { name: "name", label: "Name", type: "text", required: true, defaultValue: manager?.name },
    { name: "phone", label: "Phone", type: "text", defaultValue: manager?.phone },
    { name: "email", label: "Email", type: "text", defaultValue: manager?.email },
  ];
  if (manager) {
    fields.push({
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
  return fields;
}

export function NewManagerForm() {
  return <ActionForm operation="createManager" submitLabel="Add manager" successMessage="Manager added." fields={managerFields()} />;
}

export function ManagerEditForm({ manager }: { manager: Manager }) {
  return (
    <ActionForm
      operation="updateManager"
      submitLabel="Save manager"
      successMessage="Manager updated."
      hidden={{ id: manager.id }}
      fields={managerFields(manager)}
    />
  );
}
