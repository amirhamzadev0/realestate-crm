import "server-only";

import type { Project } from "@/models/project";
import type { ProjectRepository } from "@/repositories/contracts";
import { select, selectOne, type Row } from "./db";

const COLUMNS = `id, slug, name, location, status, start_date AS startDate, total_units AS totalUnits,
  budget, admin_name AS adminName, image, sort_order AS \`order\``;

const decode = (row: Row) => row as unknown as Project;

export class MysqlProjectRepository implements ProjectRepository {
  async list() {
    return (await select(`SELECT ${COLUMNS} FROM projects ORDER BY sort_order, name`)).map(decode);
  }
  async findBySlug(slug: string) {
    const row = await selectOne(`SELECT ${COLUMNS} FROM projects WHERE slug = ?`, [slug]);
    return row ? decode(row) : null;
  }
  async findById(id: string) {
    const row = await selectOne(`SELECT ${COLUMNS} FROM projects WHERE id = ?`, [id]);
    return row ? decode(row) : null;
  }
}
