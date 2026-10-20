import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { visibleNav } from "@/config/access";
import { superAdminNav } from "@/config/navigation";
import { requireRole } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["superadmin"]);
  return (
    <AppShell portal="Super Admin" subtitle="Builder / owner" items={visibleNav(superAdminNav, user.role)} user={user}>
      {children}
    </AppShell>
  );
}
