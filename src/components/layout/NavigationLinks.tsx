"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { NavItem } from "@/models/site";

export function NavigationLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // The deepest matching link wins, so "/sales" is not active on "/sales/leads".
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="sidebar__nav" aria-label="Section">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`sidebar__link${item.href === active ? " sidebar__link--active" : ""}`}
          aria-current={item.href === active ? "page" : undefined}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
