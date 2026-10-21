import "server-only";

import type { Project } from "@/models/project";
import type { ProjectRepository } from "@/repositories/contracts";
import { run, select, selectOne, type Row } from "./db";

const COLUMNS = `id, slug, name, location, status, start_date AS startDate, total_units AS totalUnits,
  budget, manager_id AS managerId, admin_name AS adminName, image, sort_order AS \`order\``;

const decode = (row: Row) => row as unknown as Project;

export class MysqlProjectRepository implements ProjectRepository {
  async list() {
    return (await select(`SELECT ${COLUMNS} FROM projects ORDER BY sort_order, name`)).map(decode);
  }
  async findBySlug(slug: string) {
    const row = await selectOne(`SELECT ${COLUMNS} FROM projects WHERE slug = ?`, [slug]);
    return row ? decode(row) : null;
  }
  async save(project: Project) {
    await run(
      `INSERT INTO projects (id, slug, name, location, status, start_date, total_units, budget, manager_id, admin_name, image, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), location = VALUES(location), status = VALUES(status),
         start_date = VALUES(start_date), total_units = VALUES(total_units), budget = VALUES(budget),
         manager_id = VALUES(manager_id), admin_name = VALUES(admin_name), image = VALUES(image)`,
      [project.id, project.slug, project.name, project.location, project.status, project.startDate, project.totalUnits, project.budget, project.managerId, project.adminName, project.image, project.order],
    );
    return project;
  }
  async findById(id: string) {
    const row = await selectOne(`SELECT ${COLUMNS} FROM projects WHERE id = ?`, [id]);
    return row ? decode(row) : null;
  }
}
