export type Role = "superadmin" | "project-admin" | "warehouse" | "sales";

export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
}

export interface PortalInfo {
  role: Role;
  title: string;
  description: string;
  href: string;
  icon: string;
}
