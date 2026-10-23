"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useNotificationCounts } from "@/components/layout/NotificationsContext";

/**
 * The notification bell in the corner. A red number on it says how many follow-ups are due. Clicking it while some are due takes
 * the agent to their leads with those clients highlighted, ready to call or message; with none due it opens the upcoming list.
 */
export function NotificationBell({ dueHref, idleHref }: { dueHref: string; idleHref: string }) {
  const count = useNotificationCounts()?.followUps ?? 0;
  return (
    <Link
      href={count > 0 ? dueHref : idleHref}
      className="bell no-print"
      aria-label={count > 0 ? `${count} follow-ups are due` : "Follow-ups"}
      title={count > 0 ? `${count} follow-up${count === 1 ? " is" : "s are"} due. Click to see them in your leads.` : "No follow-up is due"}
    >
      <Bell size={20} aria-hidden="true" />
      {count > 0 ? <span className="bell__badge">{count > 9 ? "9+" : count}</span> : null}
    </Link>
  );
}
