import type { ProjectRepository } from "@/repositories/contracts";
import type { Project } from "@/models/project";
import { getStore, upsert } from "./store";

export class MockProjectRepository implements ProjectRepository {
  async list() {
    return structuredClone([...getStore().projects].sort((a, b) => a.order - b.order));
  }
  async findBySlug(slug: string) {
    const found = getStore().projects.find((p) => p.slug === slug);
    return found ? structuredClone(found) : null;
  }
  async save(project: Project) {
    return upsert(getStore().projects, project);
  }
  async findById(id: string) {
    const found = getStore().projects.find((p) => p.id === id);
    return found ? structuredClone(found) : null;
  }
}
