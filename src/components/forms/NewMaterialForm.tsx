import { ActionForm } from "@/components/forms/ActionForm";

/** Adds a material that can be requested and ordered (for example Sand, in tons). */
export function NewMaterialForm() {
  return (
    <ActionForm
      operation="addMaterial"
      submitLabel="Add material"
      successMessage="Material added. It can now be requested and ordered."
      fields={[
        { name: "name", label: "Material name", type: "text", required: true },
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
      ]}
    />
  );
}
