import { ActionForm } from "@/components/forms/ActionForm";
import type { Project } from "@/models/project";
import type { Agent } from "@/models/sales";

export function SaleForm({ projects, agents }: { projects: Project[]; agents: Agent[] }) {
  return (
    <ActionForm
      operation="recordSale"
      submitLabel="Record sale"
      fields={[
        {
          name: "projectId",
          label: "Project",
          type: "select",
          required: true,
          options: projects.map((p) => ({ value: p.id, label: p.name })),
        },
        {
          name: "agentId",
          label: "Agent",
          type: "select",
          required: true,
          options: agents.map((a) => ({ value: a.id, label: `${a.name} (${a.commissionRate}%)` })),
        },
        { name: "unit", label: "Unit / plot", type: "text", required: true },
        { name: "price", label: "Sale price (PKR)", type: "number", required: true },
      ]}
    />
  );
}
