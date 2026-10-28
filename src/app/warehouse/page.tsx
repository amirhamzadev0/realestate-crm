import type { Metadata } from "next";
import Link from "next/link";
import { NewMaterialForm } from "@/components/forms/NewMaterialForm";
import { OrderMaterialForm } from "@/components/forms/OrderMaterialForm";
import { PaymentsDueTable } from "@/components/inventory/PaymentsDueTable";
import { RequestTable } from "@/components/inventory/RequestTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/server/auth/session";
import { getOrdersPage } from "@/viewmodels/warehouse.viewmodel";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage() {
  const { materials, projects, onOrder, paymentsDue, awaitingApproval, history, historyTotal } = await getOrdersPage();
  // Only the Super Admin can cancel an order; the orders desk marks deliveries.
  const canCancel = (await getCurrentUser())?.role === "superadmin";

  return (
    <>
      <PageHeader
        title="Material orders"
        subtitle="There is no central stock. Material is ordered for a project, and goes into that project's inventory when it is delivered."
      />
      <Card title="Order material for a project">
        <OrderMaterialForm projects={projects} materials={materials} />
      </Card>
      <Card title={`On order, waiting to arrive (${onOrder.length})`}>
        <RequestTable requests={onOrder} mode="deliver" canCancel={canCancel} />
      </Card>
      <Card title={`Delivered, balance to send to vendors (${paymentsDue.length})`}>
        <PaymentsDueTable orders={paymentsDue} canPay={canCancel} />
      </Card>
      <Card title={`Project requests waiting for the Super Admin (${awaitingApproval.length})`}>
        <RequestTable requests={awaitingApproval} />
      </Card>
      <Card
        title={`Delivered and rejected (latest ${history.length} of ${historyTotal})`}
        action={
          <Link href="/warehouse/history" className="link">
            View all records
          </Link>
        }
      >
        <RequestTable requests={history} />
      </Card>
      <Card title="Add a material to the list">
        <NewMaterialForm />
      </Card>
    </>
  );
}
