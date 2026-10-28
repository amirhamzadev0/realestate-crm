/** High-rise units are sold by area at a rate per sq ft; land plotting sells plots by size at a rate per marla. */
export type ProjectType = "high-rise" | "land-plotting";

export const saleUnit: Record<ProjectType, { area: string; rate: string }> = {
  "high-rise": { area: "sq ft", rate: "per sq ft" },
  "land-plotting": { area: "marla", rate: "per marla" },
};

/** What a unit or plot is used for. Each category has its own price in a project. */
export const plotCategories = ["commercial", "residential", "general"] as const;
export type PlotCategory = (typeof plotCategories)[number];

export const categoryLabels: Record<PlotCategory, string> = {
  commercial: "Commercial",
  residential: "Residential",
  general: "General",
};

/** The price of one plot category: PKR per sq ft (high-rise) or per marla (land plotting). */
export interface ProjectRate {
  category: PlotCategory;
  rate: number;
  units?: number; // how many units of this category the project has (counted from `units` for a high-rise)
}

/** One unit of a high-rise: its plot type, the floor it is on, its number and its size in sq ft. */
export interface ProjectUnit {
  category: PlotCategory;
  floor: string; // "1", "G", "Mezzanine" ...
  unit: string; // unique inside the project
  area: number;
}

export type ProjectStatus = "planning" | "under-construction" | "completed";

export interface Project {
  id: string;
  slug: string;
  name: string;
  location: string;
  type: ProjectType;
  rates: ProjectRate[]; // the plot categories on offer, each with its price
  units: ProjectUnit[]; // high-rise only: every unit with its type, floor and size; totalUnits is their count
  status: ProjectStatus;
  startDate: string; // ISO date
  totalUnits: number;
  totalArea: number; // the whole site: sq ft for a high-rise, marla for a land plotting; 0 when not entered
  budget: number;
  managerId: string | null; // the Manager running this project
  adminName: string; // that manager's name, kept in step with the Manager record ("Unassigned" when none)
  image: string;
  order: number;
}

/** The price of a category in a project, or undefined when the project does not offer it. */
export function rateFor(project: Project, category: PlotCategory): number | undefined {
  return project.rates.find((r) => r.category === category)?.rate;
}

/** What the sale form needs to know about a project: its prices and, for a high-rise, the units still free. */
export interface SaleProject {
  id: string;
  name: string;
  type: ProjectType;
  rates: ProjectRate[];
  hasUnitList: boolean; // a high-rise with its units listed sells those units
  availableUnits: ProjectUnit[]; // the listed units that are not sold yet
  allUnits: (ProjectUnit & { sold: boolean })[]; // every listed unit; the sold ones are marked so they cannot be picked again
}
