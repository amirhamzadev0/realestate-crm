"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNotificationCounts } from "@/components/layout/NotificationsContext";
import { Icon } from "@/components/ui/Icon";
import type { NavItem } from "@/models/site";

/**
 * Sidebar links. Items that share a `group` (for example the Sales portal's "Manager" and "Agent") sit under one
 * heading that opens and closes; the group that holds the current page is open.
 */
export function NavigationLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const counts = useNotificationCounts();
  // The deepest matching link wins, so "/sales" is not active on "/sales/leads".
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const link = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      className={`sidebar__link${item.href === active ? " sidebar__link--active" : ""}`}
      aria-current={item.href === active ? "page" : undefined}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
      {item.badge === "follow-ups" && counts && counts.followUps > 0 ? (
        <span className="nav-badge" aria-label={`${counts.followUps} due`}>
          {counts.followUps > 9 ? "9+" : counts.followUps}
        </span>
      ) : null}
    </Link>
  );

  // Keep the order of first appearance: a group takes the place of its first item.
  const blocks: ({ group: string; items: NavItem[] } | { single: NavItem })[] = [];
  for (const item of items) {
    if (!item.group) {
      blocks.push({ single: item });
      continue;
    }
    const existing = blocks.find((b): b is { group: string; items: NavItem[] } => "group" in b && b.group === item.group);
    if (existing) existing.items.push(item);
    else blocks.push({ group: item.group, items: [item] });
  }

  return (
    <nav className="sidebar__nav" aria-label="Section">
      {blocks.map((block) =>
        "single" in block ? (
          link(block.single)
        ) : (
          <details key={block.group} className="sidebar__group" open={block.items.some((item) => item.href === active)}>
            <summary className="sidebar__group-title">{block.group}</summary>
            <div className="sidebar__group-links">{block.items.map(link)}</div>
          </details>
        ),
      )}
    </nav>
  );
}
