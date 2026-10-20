import { ActionForm } from "@/components/forms/ActionForm";
import type { StockView } from "@/models/inventory";

export function UsageForm({ projectId, stock }: { projectId: string; stock: StockView[] }) {
  return (
    <ActionForm
      operation="recordMaterialUsage"
      submitLabel="Record usage"
      hidden={{ projectId }}
      fields={[
        {
          name: "materialId",
          label: "Material used",
          type: "select",
          required: true,
          options: stock.map((s) => ({ value: s.materialId, label: `${s.materialName} (${s.quantity} ${s.unit} left)` })),
        },
        { name: "quantity", label: "Quantity used", type: "number", required: true },
      ]}
    />
  );
}
