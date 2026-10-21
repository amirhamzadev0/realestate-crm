import { z } from "zod";
import type { Manager, ManagerView } from "@/models/manager";
import { plotCategories, type Project, type ProjectRate, type ProjectType, type ProjectUnit } from "@/models/project";
import type { ManagerRepository, ProjectRepository, SalesRepository } from "@/repositories/contracts";
import { AppError, notFound } from "@/utils/errors";
import { newId } from "@/utils/id";
import { slugify } from "@/utils/slug";

export const UNASSIGNED = "Unassigned";

// No practical cap on project figures; this is only the largest whole number JavaScript and the database store exactly.
const SAFE_MAX = Number.MAX_SAFE_INTEGER;

const rateSchema = z.object({
  category: z.enum(plotCategories),
  rate: z.number().positive().max(SAFE_MAX),
  units: z.number().int().min(1).max(SAFE_MAX).optional(),
});

const unitSchema = z.object({
  category: z.enum(plotCategories),
  floor: z.string().trim().min(1).max(20),
  unit: z.string().trim().min(1).max(60),
  area: z.number().positive().max(10_000_000),
});

export const projectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
  type: z.enum(["high-rise", "land-plotting"]),
  rates: z.array(rateSchema).min(1, "Set a price for at least one plot type"),
  units: z.array(unitSchema).default([]),
  status: z.enum(["planning", "under-construction", "completed"]),
  startDate: z.iso.date(),
  totalUnits: z.number().int().min(0).max(SAFE_MAX).optional(),
  budget: z.number().min(0).max(SAFE_MAX),
  managerId: z.string().min(1).nullable().default(null),
});

export const managerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).default(""),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(254)]).default(""),
});

// Forms send "true" / "false" as text; the API may send a real boolean.
const activeFlag = z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]);
export const managerUpdateSchema = managerSchema.extend({ active: activeFlag.default(true) });

/**
 * Checks the price table and the units, and settles the total units.
 * - Land plotting: every plot type on offer needs its number of plots, and the total is their sum.
 * - High-rise: the units are listed one by one (type, floor, number, size); the number of units of each type and
 *   the total are counted from that list, and a type with units needs a price.
 */
function layout(
  type: ProjectType,
  input: { rates: ProjectRate[]; units: ProjectUnit[]; totalUnits?: number },
): { rates: ProjectRate[]; units: ProjectUnit[]; totalUnits: number } {
  const { rates } = input;
  if (new Set(rates.map((r) => r.category)).size !== rates.length) {
    throw new AppError("Each plot type can have only one price", 400);
  }

  if (type === "land-plotting") {
    const counted = rates.filter((r) => r.units !== undefined).length;
    if (counted !== rates.length) throw new AppError("Enter how many commercial, residential or general plots there are", 400);
    const onTypes = rates.reduce((sum, r) => sum + (r.units ?? 0), 0);
    const totalUnits = input.totalUnits ?? onTypes;
    if (totalUnits !== onTypes) {
      throw new AppError(`Total units (${totalUnits}) must equal the units of all plot types (${onTypes})`, 400);
    }
    return { rates, units: [], totalUnits };
  }

  const units = input.units;
  if (units.length === 0) throw new AppError("Add the units of this high-rise: plot type, floor, unit number and size", 400);
  if (new Set(units.map((u) => u.unit.toLowerCase())).size !== units.length) {
    const seen = new Set<string>();
    const duplicate = units.find((u) => (seen.has(u.unit.toLowerCase()) ? true : (seen.add(u.unit.toLowerCase()), false)));
    throw new AppError(`Unit ${duplicate?.unit} is listed twice. Every unit number must be different.`, 400);
  }
  for (const category of new Set(units.map((u) => u.category))) {
    if (!rates.some((r) => r.category === category)) throw new AppError(`Set a price for the ${category} units`, 400);
  }
  if (input.totalUnits !== undefined && input.totalUnits !== units.length) {
    throw new AppError(`Total units (${input.totalUnits}) must equal the number of units listed (${units.length})`, 400);
  }
  // The price table keeps only the types that have units, each with its count.
  const counted = rates
    .map((r) => ({ ...r, units: units.filter((u) => u.category === r.category).length }))
    .filter((r) => r.units > 0);
  return { rates: counted, units, totalUnits: units.length };
}

export class ProjectService {
  constructor(
    private repo: ProjectRepository,
    private managers: ManagerRepository,
    private sales?: SalesRepository,
  ) {}

  list(): Promise<Project[]> {
    return this.repo.list();
  }

  findBySlug(slug: string): Promise<Project | null> {
    return this.repo.findBySlug(slug);
  }

  findById(id: string): Promise<Project | null> {
    return this.repo.findById(id);
  }

  /** Checks a manager can run `projectId`: it exists, is active, and does not run another project. */
  private async resolveManager(managerId: string | null, projectId: string | null): Promise<Manager | null> {
    if (!managerId) return null;
    const manager = await this.managers.find(managerId);
    if (!manager) throw notFound("Manager");
    if (!manager.active) throw new AppError(`${manager.name} is inactive and cannot be assigned`, 409);
    const other = (await this.repo.list()).find((p) => p.managerId === managerId && p.id !== projectId);
    if (other) throw new AppError(`${manager.name} already manages ${other.name}. Assign another manager there first.`, 409);
    return manager;
  }

  /** A new project. The URL slug comes from the name and stays fixed afterwards. */
  async create(input: unknown): Promise<Project> {
    const { totalUnits, rates, units, ...data } = projectSchema.parse(input);
    const settled = layout(data.type, { rates, units, totalUnits });
    const manager = await this.resolveManager(data.managerId, null);
    const projects = await this.repo.list();

    const base = slugify(data.name) || "project";
    let slug = base;
    for (let n = 2; projects.some((p) => p.slug === slug); n++) slug = `${base}-${n}`;

    return this.repo.save({
      ...data,
      ...settled,
      id: newId("p"),
      slug,
      managerId: manager?.id ?? null,
      adminName: manager?.name ?? UNASSIGNED,
      image: "",
      order: projects.reduce((max, p) => Math.max(max, p.order), 0) + 1,
    });
  }

  /** Changes project details and, when `managerId` differs, hands the project to another manager (or none). */
  async update(id: string, input: unknown): Promise<Project> {
    const existing = await this.repo.findById(id);
    if (!existing) throw notFound("Project");
    // The type decides how units are sold and recorded, so it is fixed once the project exists.
    const { totalUnits, rates, units, ...data } = projectSchema.omit({ type: true }).parse(input);
    const settled = layout(existing.type, { rates, units, totalUnits });
    await this.assertRoomForSales(existing, settled);
    const manager = await this.resolveManager(data.managerId, id);
    return this.repo.save({
      ...existing,
      ...data,
      ...settled,
      managerId: manager?.id ?? null,
      adminName: manager?.name ?? UNASSIGNED,
    });
  }

  /** What is already sold must still fit: enough units, in the same plot type, and listed units not removed. */
  private async assertRoomForSales(
    project: Project,
    next: { rates: ProjectRate[]; units: ProjectUnit[]; totalUnits: number },
  ): Promise<void> {
    if (!this.sales) return;
    const sold = (await this.sales.listSales()).filter((s) => s.projectId === project.id);
    if (next.totalUnits < sold.length) {
      throw new AppError(`${sold.length} units are already sold, so total units cannot be ${next.totalUnits}`, 409);
    }
    for (const sale of sold) {
      if (!next.rates.some((r) => r.category === sale.category)) {
        throw new AppError(`${sale.category} units are already sold, so that plot type cannot be removed`, 409);
      }
    }
    if (next.units.length) {
      for (const sale of sold) {
        const unit = next.units.find((u) => u.unit.toLowerCase() === sale.unit.toLowerCase());
        if (!unit || unit.category !== sale.category) {
          throw new AppError(`Unit ${sale.unit} is already sold, so it cannot be removed or moved to another plot type`, 409);
        }
      }
      return;
    }
    for (const rate of next.rates) {
      const soldOfType = sold.filter((s) => s.category === rate.category).length;
      if (rate.units !== undefined && rate.units < soldOfType) {
        throw new AppError(`${soldOfType} ${rate.category} units are already sold, so there cannot be only ${rate.units}`, 409);
      }
    }
  }

  async listManagers(): Promise<ManagerView[]> {
    const [managers, projects] = await Promise.all([this.managers.list(), this.repo.list()]);
    return managers.map((m) => {
      const project = projects.find((p) => p.managerId === m.id);
      return { ...m, projectId: project?.id ?? null, projectName: project?.name ?? null };
    });
  }

  async createManager(input: unknown): Promise<Manager> {
    const data = managerSchema.parse(input);
    return this.managers.save({ ...data, id: newId("mgr"), active: true });
  }

  /** Edits a manager. Their project shows the new name straight away. */
  async updateManager(id: string, input: unknown): Promise<Manager> {
    const existing = await this.managers.find(id);
    if (!existing) throw notFound("Manager");
    const data = managerUpdateSchema.parse(input);
    const project = (await this.repo.list()).find((p) => p.managerId === id);
    if (project && !data.active) {
      throw new AppError(`${existing.name} runs ${project.name}. Assign another manager there before making them inactive.`, 409);
    }
    const saved = await this.managers.save({ ...existing, ...data });
    if (project && project.adminName !== saved.name) await this.repo.save({ ...project, adminName: saved.name });
    return saved;
  }
}
