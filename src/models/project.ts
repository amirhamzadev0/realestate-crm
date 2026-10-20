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
  adminName: string; // manager of this project
  image: string;
  order: number;
}
