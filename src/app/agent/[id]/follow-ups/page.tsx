import type { Metadata } from "next";
import { FollowUpList } from "@/components/sales/FollowUps";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getAgentFollowUps } from "@/viewmodels/sales.viewmodel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Follow-ups" };

/** The agent's follow-ups: the clients who asked to be contacted again, with the date and time, nearest first. */
export default async function FollowUpsPage({ params }: { params: Promise<{ id: string }> }) {
  const items = await getAgentFollowUps((await params).id);

  return (
    <>
      <PageHeader title="Upcoming follow-ups" subtitle="Clients who asked you to contact them again. The nearest one is first; a follow-up whose time has come shows as due." />
      <Card title={`Follow-ups (${items.length})`}>
        <FollowUpList items={items} />
      </Card>
    </>
  );
}
