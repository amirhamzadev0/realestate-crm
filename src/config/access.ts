import type { NavItem, Role } from "@/models/site";

/** Which roles may open each portal. The longest matching prefix decides. */
const portalAccess: { prefix: string; roles: Role[] }[] = [
  { prefix: "/superadmin", roles: ["superadmin"] },
  { prefix: "/warehouse", roles: ["superadmin", "warehouse"] },
  { prefix: "/finance", roles: ["superadmin", "finance"] },
  { prefix: "/sales", roles: ["superadmin", "sales"] },
  { prefix: "/agent", roles: ["superadmin", "sales", "agent"] },
  { prefix: "/projects", roles: ["superadmin", "project-admin"] },
];

export function canAccess(role: Role, href: string): boolean {
  const rule = portalAccess.find((r) => href === r.prefix || href.startsWith(`${r.prefix}/`));
  return rule ? rule.roles.includes(role) : true;
}

/** Sidebar links a role would be bounced from are hidden. */
export function visibleNav(items: NavItem[], role: Role): NavItem[] {
  return items.filter((item) => canAccess(role, item.href));
}

export const roleLabels: Record<Role, string> = {
  superadmin: "Super Admin",
  "project-admin": "Project Admin",
  warehouse: "Orders desk",
  sales: "Sales Manager",
  agent: "Agent",
  finance: "Finance",
};
