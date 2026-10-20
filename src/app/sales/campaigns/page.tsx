import type { Metadata } from "next";
import { CampaignTable } from "@/components/sales/CampaignTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCampaignsPage } from "@/viewmodels/sales.viewmodel";

export const metadata: Metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const { rows } = await getCampaignsPage();

  return (
    <>
      <PageHeader title="Campaigns" subtitle="Lead volume and cost per lead for each ad campaign" />
      <Card>
        <CampaignTable rows={rows} />
      </Card>
    </>
  );
}
