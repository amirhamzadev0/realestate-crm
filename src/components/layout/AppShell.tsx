import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/layout/LogoutButton";
import { NavigationLinks } from "@/components/layout/NavigationLinks";
import { authEnabled } from "@/config/auth";
import { roleLabels } from "@/config/access";
import type { AuthUser } from "@/models/auth";
import type { NavItem } from "@/models/site";

export function AppShell({
  portal,
  subtitle,
  items,
  user,
  children,
}: {
  portal: string;
  subtitle?: string;
  items: NavItem[];
  user: AuthUser;
  children: ReactNode;
}) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="sidebar__brand">
          <span className="sidebar__logo">B</span>
          <span>BuildFlow CRM</span>
        </Link>
        <div className="sidebar__portal">
          <strong>{portal}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
        <NavigationLinks items={items} />
        {authEnabled ? (
          <div className="sidebar__user">
            <strong>{user.name}</strong>
            <span>{roleLabels[user.role]}</span>
            <LogoutButton />
          </div>
        ) : null}
      </aside>
      <main className="shell__main">{children}</main>
    </div>
  );
}
