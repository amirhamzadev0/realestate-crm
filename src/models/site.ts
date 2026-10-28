export type Role = "superadmin" | "project-admin" | "warehouse" | "sales" | "agent" | "finance";

export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
  badge?: "follow-ups"; // shows a red count on this link: how many of that kind of notification are waiting
  group?: string; // items with the same group sit under one heading that opens and closes
}

export interface PortalInfo {
  role: Role;
  title: string;
  description: string;
  href: string;
  icon: string;
}
