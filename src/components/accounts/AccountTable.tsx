import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageHeader";
import type { AccountEntry } from "@/models/accounts";
import { formatDate, formatMoney } from "@/utils/format";

const tones = { credit: "success", sale: "success", debit: "danger", expense: "danger", purchase: "warning" } as const;

export function AccountTable({ entries }: { entries: AccountEntry[] }) {
  if (entries.length === 0) return <EmptyState>No entries yet.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Description</th>
            <th>Party</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{formatDate(entry.date)}</td>
              <td>
                <Badge tone={tones[entry.type]}>{entry.type}</Badge>
              </td>
              <td>{entry.description}</td>
              <td>{entry.party || "-"}</td>
              <td className="num">{formatMoney(entry.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
