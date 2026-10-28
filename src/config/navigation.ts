import type { NavItem } from "@/models/site";

export const superAdminNav: NavItem[] = [
  { label: "Dashboard", href: "/superadmin", icon: "LayoutDashboard" },
  { label: "Projects", href: "/superadmin/projects", icon: "Building2" },
  { label: "Approvals", href: "/superadmin/approvals", icon: "ClipboardCheck" },
  { label: "Direct sales", href: "/superadmin/direct-sales", icon: "BadgeDollarSign" },
  { label: "Orders", href: "/warehouse", icon: "Truck" },
  { label: "Finance", href: "/finance", icon: "Landmark" },
  { label: "Sales", href: "/sales", icon: "Handshake" },
  { label: "Sales team", href: "/superadmin/sales-team", icon: "UserRoundCheck" },
  { label: "Agent reports", href: "/superadmin/agent-reports", icon: "ChartNoAxesColumn" },
];

export const warehouseNav: NavItem[] = [
  { label: "Orders", href: "/warehouse", icon: "Truck" },
  { label: "Super Admin", href: "/superadmin", icon: "Crown" },
];

/** The Finance department: instalments of units sold on a payment plan. */
export const financeNav: NavItem[] = [
  { label: "Overview", href: "/finance", icon: "LayoutDashboard" },
  { label: "Instalments", href: "/finance/installments", icon: "BellRing", badge: "follow-ups" },
  { label: "Ledgers", href: "/finance/ledgers", icon: "Wallet" },
  { label: "Booked units", href: "/finance/sales", icon: "Building2" },
  { label: "Edit instalments", href: "/finance/edit", icon: "ClipboardCheck" },
  { label: "Super Admin", href: "/superadmin", icon: "Crown" },
];

/** The sales department has two sides: the manager's work and the agents' portals. */
export const salesNav: NavItem[] = [
  { label: "Overview", href: "/sales", icon: "LayoutDashboard", group: "Manager" },
  { label: "Leads", href: "/sales/leads", icon: "Users", group: "Manager" },
  { label: "Agents", href: "/sales/agents", icon: "UserRoundCheck", group: "Manager" },
  { label: "Direct sale", href: "/sales/direct-sales", icon: "BadgeDollarSign", group: "Manager" },
  { label: "Sales & Commission", href: "/sales/reports", icon: "ChartNoAxesColumn", group: "Manager" },
  { label: "Agent reports", href: "/sales/agent-reports", icon: "ChartNoAxesColumn", group: "Manager" },
  { label: "Agent portals", href: "/agent", icon: "UsersRound", group: "Agent" },
  { label: "Super Admin", href: "/superadmin", icon: "Crown" },
];

export function projectNav(slug: string): NavItem[] {
  const base = `/projects/${slug}`;
  return [
    { label: "Overview", href: base, icon: "LayoutDashboard" },
    { label: "Accounts", href: `${base}/accounts`, icon: "Wallet" },
    { label: "Inventory", href: `${base}/inventory`, icon: "Boxes" },
    { label: "HR", href: `${base}/hr`, icon: "UsersRound" },
    { label: "All projects", href: "/projects", icon: "Building2" },
  ];
}

/** An agent's own portal. */
export function agentNav(id: string): NavItem[] {
  return [
    { label: "My leads and sales", href: `/agent/${id}`, icon: "LayoutDashboard" },
    { label: "Follow-ups", href: `/agent/${id}/follow-ups`, icon: "BellRing", badge: "follow-ups" },
    { label: "Sell a unit", href: `/agent/${id}/sell`, icon: "BadgeDollarSign" },
    { label: "Back to sales", href: "/sales", icon: "Handshake" },
  ];
}
