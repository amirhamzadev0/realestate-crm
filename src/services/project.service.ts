import { z } from "zod";
import type { Manager, ManagerView } from "@/models/manager";
import type { Project } from "@/models/project";
import type { ManagerRepository, ProjectRepository } from "@/repositories/contracts";
import { AppError, notFound } from "@/utils/errors";
import { newId } from "@/utils/id";
import { slugify } from "@/utils/slug";

export const UNASSIGNED = "Unassigned";

export const projectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  location: z.string().trim().min(1).max(200),
  status: z.enum(["planning", "under-construction", "completed"]),
  startDate: z.iso.date(),
  totalUnits: z.number().int().min(0).max(100_000),
  budget: z.number().min(0).max(1_000_000_000_000),
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

export class ProjectService {
  constructor(
    private repo: ProjectRepository,
    private managers: ManagerRepository,
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
    const data = projectSchema.parse(input);
    const manager = await this.resolveManager(data.managerId, null);
    const projects = await this.repo.list();

    const base = slugify(data.name) || "project";
    let slug = base;
    for (let n = 2; projects.some((p) => p.slug === slug); n++) slug = `${base}-${n}`;

    return this.repo.save({
      ...data,
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
    const data = projectSchema.parse(input);
    const manager = await this.resolveManager(data.managerId, id);
    return this.repo.save({
      ...existing,
      ...data,
      managerId: manager?.id ?? null,
      adminName: manager?.name ?? UNASSIGNED,
    });
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
