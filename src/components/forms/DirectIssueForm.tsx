import { ActionForm } from "@/components/forms/ActionForm";
import type { StockView } from "@/models/inventory";
import type { Project } from "@/models/project";
import { formatNumber } from "@/utils/format";

/** The warehouse sends material to a project on its own, without waiting for a request. */
export function DirectIssueForm({ projects, stock }: { projects: Project[]; stock: StockView[] }) {
  return (
    <ActionForm
      operation="issueMaterialDirect"
      submitLabel="Send to project"
      successMessage="Material sent. It is now in the project inventory."
      fields={[
        {
          name: "projectId",
          label: "Project",
          type: "select",
          required: true,
          options: projects.map((p) => ({ value: p.id, label: p.name })),
        },
        {
          name: "materialId",
          label: "Material",
          type: "select",
          required: true,
          options: stock.map((s) => ({ value: s.materialId, label: `${s.materialName} (${formatNumber(s.quantity)} ${s.unit} in warehouse)` })),
        },
        { name: "quantity", label: "Quantity", type: "number", required: true },
        { name: "note", label: "Note (optional)", type: "text" },
      ]}
    />
  );
}
