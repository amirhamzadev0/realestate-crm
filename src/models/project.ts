export type ProjectStatus = "planning" | "under-construction" | "completed";

export interface Project {
  id: string;
  slug: string;
  name: string;
  location: string;
  status: ProjectStatus;
  startDate: string; // ISO date
  totalUnits: number;
  budget: number;
  managerId: string | null; // the Manager running this project
  adminName: string; // that manager's name, kept in step with the Manager record ("Unassigned" when none)
  image: string;
  order: number;
}
