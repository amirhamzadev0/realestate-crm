import { ActionForm } from "@/components/forms/ActionForm";
import type { Material } from "@/models/inventory";

export function MaterialRequestForm({
  projectId,
  requestedBy,
  materials,
}: {
  projectId: string;
  requestedBy: string;
  materials: Material[];
}) {
  return (
    <ActionForm
      operation="submitMaterialRequest"
      submitLabel="Send request to Super Admin"
      hidden={{ projectId, requestedBy }}
      fields={[
        {
          name: "materialId",
          label: "Material",
          type: "select",
          required: true,
          options: materials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` })),
        },
        { name: "quantity", label: "Quantity", type: "number", required: true },
        { name: "note", label: "Reason / note", type: "textarea" },
      ]}
    />
  );
}
