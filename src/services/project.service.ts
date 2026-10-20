import type { Project } from "@/models/project";
import type { ProjectRepository } from "@/repositories/contracts";

export class ProjectService {
  constructor(private repo: ProjectRepository) {}

  list(): Promise<Project[]> {
    return this.repo.list();
  }

  findBySlug(slug: string): Promise<Project | null> {
    return this.repo.findBySlug(slug);
  }

  findById(id: string): Promise<Project | null> {
    return this.repo.findById(id);
  }
}
