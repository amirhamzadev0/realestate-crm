import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountEntryForm } from "@/components/forms/AccountEntryForm";
import { AccountSummaryCards } from "@/components/accounts/AccountSummaryCards";
import { AccountTable } from "@/components/accounts/AccountTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProjectAccounts } from "@/viewmodels/project.viewmodel";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ params }: { params: Promise<{ slug: string }> }) {
  const data = await getProjectAccounts((await params).slug);
  if (!data) notFound();

  return (
    <>
      <PageHeader title="Accounts" subtitle={data.project.name} />
      <AccountSummaryCards summary={data.summary} />
      <Card title="Add entry">
        <AccountEntryForm projectId={data.project.id} />
      </Card>
      <Card title="Ledger">
        <AccountTable entries={data.entries} />
      </Card>
    </>
  );
}
