import { ActionForm } from "@/components/forms/ActionForm";
import type { Material } from "@/models/inventory";
import type { Project } from "@/models/project";
import { today } from "@/utils/id";

/**
 * The Super Admin orders material for a project straight away, without a request from the manager: what, how much,
 * who supplies it, what it costs, the day it was ordered and how it is paid. An advance is debited from the project now.
 */
export function OrderMaterialForm({ projects, materials }: { projects: Project[]; materials: Material[] }) {
  return (
    <ActionForm
      operation="orderMaterial"
      submitLabel="Place order"
      successMessage="Order placed. The project manager can see it, and marks it received when it arrives."
      fields={[
        {
          name: "projectId",
          label: "For project (its accounts are debited)",
          type: "select",
          required: true,
          options: projects.map((p) => ({ value: p.id, label: p.name })),
        },
        {
          name: "materialId",
          label: "Material",
          type: "select",
          required: true,
          options: materials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` })),
        },
        { name: "quantity", label: "Quantity", type: "number", required: true },
        { name: "vendor", label: "Vendor", type: "text", required: true },
        { name: "totalAmount", label: "Order amount (PKR)", type: "number", required: true },
        { name: "orderDate", label: "Order date", type: "date", required: true, defaultValue: today() },
        {
          name: "paymentTerms",
          label: "Payment",
          type: "select",
          required: true,
          defaultValue: "on-delivery",
          options: [
            { value: "on-delivery", label: "Pay on delivery" },
            { value: "advance", label: "Advance now, rest on delivery" },
          ],
        },
        {
          name: "advanceAmount",
          label: "Advance paid now (PKR)",
          type: "number",
          required: true,
          showWhen: { field: "paymentTerms", values: ["advance"] },
        },
        { name: "note", label: "Note (optional)", type: "text" },
      ]}
    />
  );
}
