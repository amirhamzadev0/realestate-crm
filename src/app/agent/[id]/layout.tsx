import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { visibleNav } from "@/config/access";
import { agentNav } from "@/config/navigation";
import { requireRole } from "@/server/auth/session";
import { authService } from "@/server/container";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { NotificationsProvider } from "@/components/layout/NotificationsContext";
import { FollowUpAlert } from "@/components/sales/FollowUps";
import { getAgentFollowUps, getAgentPortal } from "@/viewmodels/sales.viewmodel";

export const dynamic = "force-dynamic";

export default async function AgentLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const user = await requireRole(["superadmin", "sales", "agent"]);
  const { id } = await params;
  const portal = await getAgentPortal(id);
  if (!portal) notFound();
  // An agent only ever sees their own portal, whatever address they type.
  if (user.role === "agent" && user.agentId !== id) redirect(await authService.homeFor(user));
  const followUps = await getAgentFollowUps(id);

  const followUpsHref = `/agent/${id}/follow-ups`;
  const dueHref = `/agent/${id}?notify=due`; // the agent's leads, with the clients who are due highlighted

  return (
    <NotificationsProvider followUps={followUps}>
      <AppShell
        portal={portal.agent.name}
        subtitle={portal.manager ? `Agent - team of ${portal.manager.name}` : "Agent"}
        items={visibleNav(agentNav(id), user.role)}
        user={user}
      >
        <NotificationBell dueHref={dueHref} idleHref={followUpsHref} />
        <FollowUpAlert items={followUps} href={followUpsHref} dueHref={dueHref} />
        {children}
      </AppShell>
    </NotificationsProvider>
  );
}
