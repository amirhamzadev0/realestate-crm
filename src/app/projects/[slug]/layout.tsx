import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { visibleNav } from "@/config/access";
import { projectNav } from "@/config/navigation";
import { requireRole } from "@/server/auth/session";
import { authService } from "@/server/container";
import { getProjectShell } from "@/viewmodels/project.viewmodel";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const user = await requireRole(["superadmin", "project-admin"]);
  const { slug } = await params;
  const project = await getProjectShell(slug);
  if (!project) notFound();
  // A project admin only ever sees their own project, whatever URL they type.
  if (user.role === "project-admin" && user.projectId !== project.id) redirect(await authService.homeFor(user));

  return (
    <AppShell
      portal={project.name}
      subtitle={`Manager: ${project.adminName}`}
      items={visibleNav(projectNav(project.slug), user.role)}
      user={user}
    >
      {children}
    </AppShell>
  );
}
