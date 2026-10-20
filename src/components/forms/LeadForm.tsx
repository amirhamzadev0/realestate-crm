import { ActionForm } from "@/components/forms/ActionForm";
import type { Agent, Campaign } from "@/models/sales";
import type { Project } from "@/models/project";

export function LeadForm({
  projects,
  agents,
  campaigns,
}: {
  projects: Project[];
  agents: Agent[];
  campaigns: Campaign[];
}) {
  return (
    <ActionForm
      operation="addLead"
      submitLabel="Add lead"
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        { name: "phone", label: "Phone", type: "text", required: true },
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
          name: "campaignId",
          label: "Campaign",
          type: "select",
          nullable: true,
          options: campaigns.map((c) => ({ value: c.id, label: c.name })),
        },
        {
          name: "agentId",
          label: "Assign to agent",
          type: "select",
          nullable: true,
          options: agents.map((a) => ({ value: a.id, label: a.name })),
        },
      ]}
    />
  );
}
