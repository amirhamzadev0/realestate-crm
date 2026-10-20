import { ActionForm } from "@/components/forms/ActionForm";

const types = ["credit", "debit", "expense", "sale", "purchase"].map((t) => ({ value: t, label: t }));

export function AccountEntryForm({ projectId }: { projectId: string }) {
  return (
    <ActionForm
      operation="addAccountEntry"
      submitLabel="Add entry"
      hidden={{ projectId }}
      fields={[
        { name: "type", label: "Type", type: "select", required: true, options: types },
        { name: "amount", label: "Amount (PKR)", type: "number", required: true },
        { name: "description", label: "Description", type: "text", required: true },
        { name: "party", label: "Party", type: "text" },
        { name: "date", label: "Date", type: "date" },
      ]}
    />
  );
}
