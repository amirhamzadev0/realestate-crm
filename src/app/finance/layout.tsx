import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { NotificationsProvider } from "@/components/layout/NotificationsContext";
import { visibleNav } from "@/config/access";
import { financeNav } from "@/config/navigation";
import { requireRole } from "@/server/auth/session";
import { getFinanceAttention } from "@/viewmodels/finance.viewmodel";

export const dynamic = "force-dynamic";

export default async function FinanceLayout({ children }: { children: ReactNode }) {
  const user = await requireRole(["superadmin", "finance"]);
  const attention = await getFinanceAttention();

  return (
    // Every instalment on the list is already due, so each one counts on the bell and in the sidebar.
    <NotificationsProvider followUps={attention.map(() => ({ at: "2000-01-01T00:00:00Z" }))}>
      <AppShell portal="Finance" subtitle="Instalments and payment follow-ups" items={visibleNav(financeNav, user.role)} user={user}>
        <NotificationBell dueHref="/finance?notify=due" idleHref="/finance/installments" />
        {attention.length > 0 ? (
          <section className="notice notice--danger no-print" role="alert">
            <strong>{attention.length === 1 ? "1 instalment needs a follow-up" : `${attention.length} instalments need a follow-up`}:</strong>{" "}
            {attention.slice(0, 3).map((item, index) => (
              <span key={item.id}>
                {index > 0 ? ", " : ""}
                {item.buyer || "Buyer"} ({item.unit})
              </span>
            ))}
            {attention.length > 3 ? ` and ${attention.length - 3} more` : ""}.{" "}
            <Link href="/finance?notify=due" className="link">
              Open the list
            </Link>
          </section>
        ) : null}
        {children}
      </AppShell>
    </NotificationsProvider>
  );
}
