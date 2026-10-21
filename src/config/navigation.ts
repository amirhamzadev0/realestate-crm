import type { NavItem } from "@/models/site";

export const superAdminNav: NavItem[] = [
  { label: "Dashboard", href: "/superadmin", icon: "LayoutDashboard" },
  { label: "Projects", href: "/superadmin/projects", icon: "Building2" },
  { label: "Approvals", href: "/superadmin/approvals", icon: "ClipboardCheck" },
  { label: "Direct sales", href: "/superadmin/direct-sales", icon: "BadgeDollarSign" },
  { label: "Warehouse", href: "/warehouse", icon: "Warehouse" },
  { label: "Sales", href: "/sales", icon: "Handshake" },
];

export const warehouseNav: NavItem[] = [
  { label: "Stock", href: "/warehouse", icon: "Boxes" },
  { label: "Issue to projects", href: "/warehouse/issue", icon: "Truck" },
  { label: "Super Admin", href: "/superadmin", icon: "Crown" },
];

export const salesNav: NavItem[] = [
  { label: "Overview", href: "/sales", icon: "LayoutDashboard" },
  { label: "Leads", href: "/sales/leads", icon: "Users" },
  { label: "Campaigns", href: "/sales/campaigns", icon: "Megaphone" },
  { label: "Agents", href: "/sales/agents", icon: "UserRoundCheck" },
  { label: "Sales & Commission", href: "/sales/reports", icon: "ChartNoAxesColumn" },
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
