import { ActionForm } from "@/components/forms/ActionForm";

export function NewWarehouseItemForm() {
  return (
    <ActionForm
      operation="addWarehouseItem"
      submitLabel="Add new item"
      successMessage="Item added to the warehouse."
      fields={[
        { name: "name", label: "Item name", type: "text", required: true },
        {
          name: "category",
          label: "Category",
          type: "select",
          required: true,
          options: [
            { value: "structure", label: "Structure" },
            { value: "finishing", label: "Finishing" },
            { value: "plumbing", label: "Plumbing" },
            { value: "electrical", label: "Electrical" },
          ],
        },
        { name: "unit", label: "Unit (kg, bag, pcs...)", type: "text", required: true },
        { name: "quantity", label: "Quantity", type: "number", required: true },
        { name: "minLevel", label: "Low-stock level", type: "number" },
      ]}
    />
  );
}
