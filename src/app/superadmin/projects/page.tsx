import type { Metadata } from "next";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { getProjectsOverview } from "@/viewmodels/superadmin.viewmodel";

export const metadata: Metadata = { title: "Projects" };

export default async function SuperAdminProjectsPage() {
  const rows = await getProjectsOverview();

  return (
    <>
      <PageHeader title="Projects" subtitle="Open a project to see its accounts, inventory and HR" />
      <div className="grid grid--3">
        {rows.map(({ project, accounts, hr }) => (
          <ProjectCard key={project.id} project={project} accounts={accounts} hr={hr} href={`/projects/${project.slug}`} />
        ))}
      </div>
    </>
  );
}
