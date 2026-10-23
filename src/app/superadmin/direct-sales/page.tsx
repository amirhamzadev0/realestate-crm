import type { Metadata } from "next";
import { DirectSalesPanel } from "@/components/sales/DirectSalesPanel";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata: Metadata = { title: "Direct sales" };

export default async function DirectSalesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  return (
    <>
      <PageHeader title="Direct sales" subtitle="Choose a project and sell a unit yourself, without an agent" />
      <DirectSalesPanel slug={(await searchParams).project} basePath="/superadmin/direct-sales" />
    </>
  );
}
