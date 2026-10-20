import type { Metadata } from "next";
import { RequestTable } from "@/components/inventory/RequestTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getWarehousePage } from "@/viewmodels/warehouse.viewmodel";

export const metadata: Metadata = { title: "Issue to projects" };

export default async function IssuePage() {
  const { toIssue, awaitingApproval, issued } = await getWarehousePage();

  return (
    <>
      <PageHeader title="Issue to projects" subtitle="Only requests approved by the Super Admin can be issued" />
      <Card title={`Approved, ready to issue (${toIssue.length})`}>
        <RequestTable requests={toIssue} mode="issue" />
      </Card>
      <Card title="Still waiting for Super Admin approval">
        <RequestTable requests={awaitingApproval} />
      </Card>
      <Card title="Issued">
        <RequestTable requests={issued} />
      </Card>
    </>
  );
}
