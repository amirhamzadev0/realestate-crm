import "server-only";

import type { Project, ProjectRate, ProjectUnit } from "@/models/project";
import type { ProjectRepository } from "@/repositories/contracts";
import { select, selectOne, transaction, type Row } from "./db";

const COLUMNS = `id, slug, name, location, project_type AS type, status, start_date AS startDate,
  total_units AS totalUnits, budget, manager_id AS managerId, admin_name AS adminName, image, sort_order AS \`order\``;

/** Attaches the price table and the unit list, which live in their own tables. */
async function withLayout(rows: Row[]): Promise<Project[]> {
  if (rows.length === 0) return [];
  const [rateRows, unitRows] = await Promise.all([
    select("SELECT project_id AS projectId, category, rate, units FROM project_rates ORDER BY FIELD(category, 'commercial', 'residential', 'general')"),
    select("SELECT project_id AS projectId, category, floor, unit, area FROM project_units ORDER BY sort_order, id"),
  ]);
  return rows.map((row) => ({
    ...(row as unknown as Omit<Project, "rates" | "units">),
    rates: rateRows.filter((r) => r.projectId === row.id).map((r): ProjectRate => ({ category: r.category, rate: Number(r.rate), ...(r.units != null ? { units: Number(r.units) } : {}) })),
    units: unitRows
      .filter((u) => u.projectId === row.id)
      .map((u): ProjectUnit => ({ category: u.category, floor: String(u.floor), unit: String(u.unit), area: Number(u.area) })),
  }));
}

export class MysqlProjectRepository implements ProjectRepository {
  async list() {
    return withLayout(await select(`SELECT ${COLUMNS} FROM projects ORDER BY sort_order, name`));
  }
  async findBySlug(slug: string) {
    const row = await selectOne(`SELECT ${COLUMNS} FROM projects WHERE slug = ?`, [slug]);
    return row ? (await withLayout([row]))[0] : null;
  }
  async findById(id: string) {
    const row = await selectOne(`SELECT ${COLUMNS} FROM projects WHERE id = ?`, [id]);
    return row ? (await withLayout([row]))[0] : null;
  }
  /** The project row, its prices and its floors are saved together or not at all. */
  async save(project: Project) {
    await transaction(async (exec) => {
      await exec(
        `INSERT INTO projects (id, slug, name, location, project_type, status, start_date, total_units, budget, manager_id, admin_name, image, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), location = VALUES(location), status = VALUES(status),
           start_date = VALUES(start_date), total_units = VALUES(total_units), budget = VALUES(budget),
           manager_id = VALUES(manager_id), admin_name = VALUES(admin_name), image = VALUES(image)`,
        [project.id, project.slug, project.name, project.location, project.type, project.status, project.startDate, project.totalUnits, project.budget, project.managerId, project.adminName, project.image, project.order],
      );
      await exec("DELETE FROM project_rates WHERE project_id = ?", [project.id]);
      for (const r of project.rates) {
        await exec("INSERT INTO project_rates (project_id, category, rate, units) VALUES (?, ?, ?, ?)", [project.id, r.category, r.rate, r.units ?? null]);
      }
      await exec("DELETE FROM project_units WHERE project_id = ?", [project.id]);
      for (const [index, u] of project.units.entries()) {
        await exec("INSERT INTO project_units (project_id, category, floor, unit, area, sort_order) VALUES (?, ?, ?, ?, ?, ?)", [project.id, u.category, u.floor, u.unit, u.area, index]);
      }
    });
    return project;
  }
}
