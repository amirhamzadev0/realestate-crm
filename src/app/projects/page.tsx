import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireRole } from "@/server/auth/session";
import { authService } from "@/server/container";
import { getProjectsOverview } from "@/viewmodels/superadmin.viewmodel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireRole(["superadmin", "project-admin"]);
  // A project admin has exactly one project, so skip the picker.
  if (user.role === "project-admin") redirect(await authService.homeFor(user));
  const rows = await getProjectsOverview();

  return (
    <AppShell
      portal="Project Admin"
      subtitle="Choose your project"
      items={[
        { label: "All projects", href: "/projects", icon: "Building2" },
        { label: "Super Admin", href: "/superadmin", icon: "Crown" },
      ]}
      user={user}
    >
      <PageHeader title="Your projects" subtitle="Each project has its own accounts, inventory and HR" />
      <div className="grid grid--3">
        {rows.map(({ project, accounts, hr, unitsSold, soldByCategory }) => (
          <ProjectCard key={project.id} project={project} accounts={accounts} hr={hr} unitsSold={unitsSold} soldByCategory={soldByCategory} href={`/projects/${project.slug}`} />
        ))}
      </div>
    </AppShell>
  );
}
