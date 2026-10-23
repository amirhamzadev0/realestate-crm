import type { Metadata } from "next";
import { DirectSalesPanel } from "@/components/sales/DirectSalesPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { salesService } from "@/server/container";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Direct sale" };

/** The sales manager sells a unit directly to a buyer, the same way the Super Admin can. */
export default async function ManagerDirectSalePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const managers = (await salesService.listSalesManagers()).filter((m) => m.active);
  return (
    <>
      <PageHeader title="Direct sale" subtitle="Choose a project and sell a unit yourself, without an agent. The sale is recorded under your name." />
      <DirectSalesPanel slug={(await searchParams).project} basePath="/sales/direct-sales" managers={managers} />
    </>
  );
}
