"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** The current time, refreshed every half minute, so something that falls due shows up by itself. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

interface NotificationCounts {
  followUps: number; // follow-ups whose time has come
}

const Counts = createContext<NotificationCounts | null>(null);

/**
 * Wraps a portal so the bell and the sidebar can show how many notifications there are. A follow-up counts as soon as its time
 * comes, without reloading the page.
 */
export function NotificationsProvider({ followUps, children }: { followUps: { at: string }[]; children: ReactNode }) {
  const now = useNow();
  const due = followUps.filter((item) => new Date(item.at).getTime() <= now).length;
  return <Counts.Provider value={{ followUps: due }}>{children}</Counts.Provider>;
}

/** The counts, or null outside a portal that has notifications. */
export const useNotificationCounts = () => useContext(Counts);
