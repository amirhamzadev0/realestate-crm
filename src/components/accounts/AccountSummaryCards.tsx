import { StatCard } from "@/components/ui/Card";
import type { AccountSummary } from "@/models/accounts";
import { formatCompactMoney } from "@/utils/format";

export function AccountSummaryCards({ summary }: { summary: AccountSummary }) {
  return (
    <div className="grid grid--5">
      <StatCard label="Total credit" value={formatCompactMoney(summary.credit)} tone="positive" />
      <StatCard label="Total debit" value={formatCompactMoney(summary.debit)} tone="negative" />
      <StatCard label="Expenses" value={formatCompactMoney(summary.expense)} tone="negative" />
      <StatCard label="Sales" value={formatCompactMoney(summary.sales)} tone="positive" />
      <StatCard label="Purchases" value={formatCompactMoney(summary.purchase)} />
      <StatCard
        label="Net balance"
        value={formatCompactMoney(summary.balance)}
        tone={summary.balance >= 0 ? "positive" : "negative"}
        hint="credit + sales - debit - expense - purchase"
      />
    </div>
  );
}
