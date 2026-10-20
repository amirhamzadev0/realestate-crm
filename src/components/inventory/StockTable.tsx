import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/PageHeader";
import type { StockView } from "@/models/inventory";
import { formatNumber } from "@/utils/format";

export function StockTable({ stock, showUsed = true }: { stock: StockView[]; showUsed?: boolean }) {
  if (stock.length === 0) return <EmptyState>No stock recorded.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Material</th>
            <th className="num">In stock</th>
            {showUsed ? <th className="num">Used</th> : null}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {stock.map((item) => (
            <tr key={item.id}>
              <td>{item.materialName}</td>
              <td className="num">
                {formatNumber(item.quantity)} {item.unit}
              </td>
              {showUsed ? (
                <td className="num">
                  {formatNumber(item.used)} {item.unit}
                </td>
              ) : null}
              <td>{item.low ? <Badge tone="danger">low stock</Badge> : <Badge tone="success">ok</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
