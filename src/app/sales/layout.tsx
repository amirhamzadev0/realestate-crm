import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { visibleNav } from "@/config/access";
import { salesNav } from "@/config/navigation";
import { requireRole } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function SalesLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["superadmin", "sales"]);
  return (
    <AppShell portal="Sales" subtitle="Agents, leads and commission" items={visibleNav(salesNav, user.role)} user={user}>
      {children}
    </AppShell>
  );
}
