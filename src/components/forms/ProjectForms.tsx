import { ActionForm, type FieldSpec } from "@/components/forms/ActionForm";
import type { Manager, ManagerView } from "@/models/manager";
import type { Project } from "@/models/project";

/** Active managers who are free, plus the one already running this project (so the form can keep or change them). */
function managerOptions(managers: ManagerView[], project?: Project) {
  return managers
    .filter((m) => m.active && (m.projectId === null || m.projectId === project?.id))
    .map((m) => ({ value: m.id, label: m.name }));
}

function projectFields(managers: ManagerView[], project?: Project): FieldSpec[] {
  return [
    { name: "name", label: "Project name", type: "text", required: true, defaultValue: project?.name },
    { name: "location", label: "Location", type: "text", required: true, defaultValue: project?.location },
    {
      name: "status",
      label: "Status",
      type: "select",
      required: true,
      defaultValue: project?.status ?? "planning",
      options: [
        { value: "planning", label: "Planning" },
        { value: "under-construction", label: "Under construction" },
        { value: "completed", label: "Completed" },
      ],
    },
    { name: "startDate", label: "Start date", type: "date", required: true, defaultValue: project?.startDate },
    { name: "totalUnits", label: "Total units", type: "number", required: true, step: "1", defaultValue: project ? String(project.totalUnits) : undefined },
    { name: "budget", label: "Budget (PKR)", type: "number", required: true, defaultValue: project ? String(project.budget) : undefined },
    {
      name: "managerId",
      label: "Manager",
      type: "select",
      nullable: true,
      defaultValue: project?.managerId ?? "",
      options: managerOptions(managers, project),
    },
  ];
}

export function NewProjectForm({ managers }: { managers: ManagerView[] }) {
  return (
    <ActionForm
      operation="createProject"
      submitLabel="Create project"
      successMessage="Project created."
      fields={projectFields(managers)}
    />
  );
}

/** Edits details and can hand the project to another manager (or leave it without one). */
export function ProjectEditForm({ project, managers }: { project: Project; managers: ManagerView[] }) {
  return (
    <ActionForm
      operation="updateProject"
      submitLabel="Save project"
      successMessage="Project updated."
      hidden={{ id: project.id }}
      fields={projectFields(managers, project)}
    />
  );
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
