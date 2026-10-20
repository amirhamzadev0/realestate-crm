import type { Metadata } from "next";
import { ChangeRequestTable } from "@/components/people/ChangeRequestTable";
import { RequestTable } from "@/components/inventory/RequestTable";
import { StockTable } from "@/components/inventory/StockTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getApprovalsPage } from "@/viewmodels/superadmin.viewmodel";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const { pending, history, pendingPeople, peopleHistory, warehouse } = await getApprovalsPage();

  return (
    <>
      <PageHeader
        title="Approvals"
        subtitle="Approving a material request moves the stock from the warehouse into the project inventory. Material requests and any change to people (add, edit, remove) wait here for your decision."
      />
      <Card title={`People changes waiting (${pendingPeople.length})`}>
        <ChangeRequestTable requests={pendingPeople} mode="approve" />
      </Card>
      <Card title={`Material requests pending (${pending.length})`}>
        <RequestTable requests={pending} mode="approve" />
      </Card>
      <Card title="Warehouse stock available to give">
        <StockTable stock={warehouse} showUsed={false} />
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
