import { StatCard } from "@/components/ui/Card";
import type { SalesReport } from "@/models/sales";
import { formatCompactMoney } from "@/utils/format";

export function SalesReportCards({ report }: { report: SalesReport }) {
  return (
    <div className="grid grid--4">
      <StatCard label="Revenue" value={formatCompactMoney(report.totalRevenue)} tone="positive" />
      <StatCard label="Units sold" value={String(report.totalSales)} />
      <StatCard label="Agent commission" value={formatCompactMoney(report.totalCommission)} />
      <StatCard label="Lead conversion" value={`${report.conversionRate}%`} hint={`${report.totalLeads} leads`} />
    </div>
  );
}
