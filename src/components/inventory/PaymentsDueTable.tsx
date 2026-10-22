import { ActionButton } from "@/components/forms/ActionButton";
import { EmptyState } from "@/components/ui/PageHeader";
import type { MaterialRequestView } from "@/models/inventory";
import { formatDate, formatMoney, formatNumber } from "@/utils/format";

/**
 * Orders whose material has been received but not fully paid: what is left to send each vendor.
 * Paying debits the order's project. Only the Super Admin gets the Pay button.
 */
export function PaymentsDueTable({ orders, canPay }: { orders: MaterialRequestView[]; canPay: boolean }) {
  if (orders.length === 0) return <EmptyState>No vendor payment is waiting.</EmptyState>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Received</th>
            <th>Project</th>
            <th>Material</th>
            <th>Vendor</th>
            <th className="num">Order amount</th>
            <th className="num">Paid</th>
            <th className="num">Balance to send</th>
            {canPay ? <th>Action</th> : null}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.receivedAt ? formatDate(order.receivedAt) : "-"}</td>
              <td>{order.projectName}</td>
              <td>
                {formatNumber(order.quantity)} {order.unit} of {order.materialName}
              </td>
              <td>{order.vendor}</td>
              <td className="num">{formatMoney(order.totalAmount ?? 0)}</td>
              <td className="num">{formatMoney(order.amountPaid ?? 0)}</td>
              <td className="num">
                <strong>{formatMoney(order.balanceDue)}</strong>
              </td>
              {canPay ? (
                <td>
                  <ActionButton
                    operation="payOrder"
                    body={{ requestId: order.id }}
                    label="Pay balance"
                    confirm={`Send ${formatMoney(order.balanceDue)} to ${order.vendor}? It is debited from ${order.projectName}.`}
                  />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
