import { ActionForm } from "@/components/forms/ActionForm";
import type { Agent } from "@/models/sales";
import type { Project } from "@/models/project";

export function LeadForm({
  projects,
  agents,
}: {
  projects: Project[];
  agents: Agent[];
}) {
  return (
    <ActionForm
      operation="addLead"
      submitLabel="Add lead"
      successMessage="Lead added. Forward it to an agent from the list below."
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        { name: "phone", label: "Phone", type: "text", required: true },
        { name: "email", label: "Email", type: "text" },
        {
          name: "projectId",
          label: "Project",
          type: "select",
          required: true,
          options: projects.map((p) => ({ value: p.id, label: p.name })),
        },
        {
          name: "source",
          label: "Source",
          type: "select",
          required: true,
          defaultValue: "facebook",
          options: ["facebook", "instagram", "walk-in", "referral", "website"].map((s) => ({ value: s, label: s })),
        },
        {
          name: "agentId",
          label: "Forward to agent (or do it later)",
          type: "select",
          nullable: true,
          options: agents.map((a) => ({ value: a.id, label: a.name })),
        },
        { name: "note", label: "Note (what the client wants, budget...)", type: "textarea" },
      ]}
    />
  );
}
