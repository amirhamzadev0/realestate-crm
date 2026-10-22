import type { Metadata } from "next";
import { ChangeRequestTable } from "@/components/people/ChangeRequestTable";
import { PaymentsDueTable } from "@/components/inventory/PaymentsDueTable";
import { RequestTable } from "@/components/inventory/RequestTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getApprovalsPage } from "@/viewmodels/superadmin.viewmodel";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const { pending, onOrder, paymentsDue, history, pendingPeople, peopleHistory } = await getApprovalsPage();

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Approving a material request places the order with a vendor, an amount and a payment plan; the material goes into the project inventory when the manager marks it received, and any balance is then sent to the vendor from here. Material requests and any change to people (add, edit, remove) wait here for your decision."
      />
      <Card title={`People changes waiting (${pendingPeople.length})`}>
        <ChangeRequestTable requests={pendingPeople} mode="approve" />
      </Card>
      <Card title={`Material requests pending (${pending.length})`}>
        <RequestTable requests={pending} mode="approve" />
      </Card>
      <Card title={`Delivered, balance to send to vendors (${paymentsDue.length})`}>
        <PaymentsDueTable orders={paymentsDue} canPay />
      </Card>
      <Card title={`Ordered, waiting to arrive (${onOrder.length})`}>
        <RequestTable requests={onOrder} mode="deliver" canCancel />
      </Card>
      <Card title="Material history">
        <RequestTable requests={history} />
      </Card>
      <Card title="People change history">
        <ChangeRequestTable requests={peopleHistory} />
      </Card>
    </>
  );
}
