import { ActionForm } from "@/components/forms/ActionForm";
import type { Material } from "@/models/inventory";

export function ReceiveStockForm({ materials, successMessage }: { materials: Material[]; successMessage?: string }) {
  return (
    <ActionForm
      operation="receiveWarehouseStock"
      submitLabel="Add to warehouse"
      successMessage={successMessage}
      fields={[
        {
          name: "materialId",
          label: "Material",
          type: "select",
          required: true,
          options: materials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` })),
        },
        { name: "quantity", label: "Quantity received", type: "number", required: true },
      ]}
    />
  );
}
