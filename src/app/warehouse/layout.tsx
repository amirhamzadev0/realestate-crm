import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { visibleNav } from "@/config/access";
import { warehouseNav } from "@/config/navigation";
import { requireRole } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function WarehouseLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["superadmin", "warehouse"]);
  return (
    <AppShell portal="Orders" subtitle="Material ordering and delivery" items={visibleNav(warehouseNav, user.role)} user={user}>
      {children}
    </AppShell>
  );
}
