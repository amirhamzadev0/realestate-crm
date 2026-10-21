import type { Metadata } from "next";
import { DirectIssueForm } from "@/components/forms/DirectIssueForm";
import { RequestTable } from "@/components/inventory/RequestTable";
import { StockTable } from "@/components/inventory/StockTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getWarehousePage } from "@/viewmodels/warehouse.viewmodel";

export const metadata: Metadata = { title: "Issue to projects" };

export default async function IssuePage() {
  const { stock, projects, openRequests, history } = await getWarehousePage();

  return (
    <>
      <PageHeader title="Issue to projects" subtitle="Send material to a project yourself, or issue or reject the requests that came in" />
      <Card title="Send material to a project">
        <DirectIssueForm projects={projects} stock={stock} />
      </Card>
      <Card title={`Requests waiting for you (${openRequests.length})`}>
        <RequestTable requests={openRequests} mode="issue" />
      </Card>
      <Card title="Warehouse stock now">
        <StockTable stock={stock} showUsed={false} />
      </Card>
      <Card title="Issued and rejected">
        <RequestTable requests={history} />
      </Card>
    </>
  );
}
