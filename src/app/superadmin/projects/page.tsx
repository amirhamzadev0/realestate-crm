import type { Metadata } from "next";
import { ManagerRemover } from "@/components/forms/ManagerRemover";
import { ManagerEditForm, NewManagerForm, NewProjectForm, ProjectEditForm } from "@/components/forms/ProjectForms";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { getProjectsManagement } from "@/viewmodels/superadmin.viewmodel";

export const metadata: Metadata = { title: "Projects" };

export default async function SuperAdminProjectsPage() {
  const { rows, managers } = await getProjectsManagement();

  return (
    <>
      <PageHeader title="Projects" subtitle="Create projects, edit their details and choose who manages them" />
      <div className="grid grid--3">
        {rows.map(({ project, accounts, hr, unitsSold, soldByCategory }) => (
          <div key={project.id} className="project-slot">
            <ProjectCard project={project} accounts={accounts} hr={hr} unitsSold={unitsSold} soldByCategory={soldByCategory} href={`/projects/${project.slug}`} />
            <details className="row-edit">
              <summary className="button button--ghost button--small">Edit project / change manager</summary>
              <ProjectEditForm project={project} managers={managers} />
            </details>
          </div>
        ))}
      </div>

      <Card title="Add a new project">
        <NewProjectForm managers={managers} />
      </Card>

      <Card title="Add a new manager">
        <NewManagerForm />
      </Card>
      <details className="row-edit">
        <summary className="button button--ghost">Edit or delete a manager ({managers.length})</summary>
        <Card title="Project managers">
          {managers.length === 0 ? (
            <EmptyState>No managers yet.</EmptyState>
          ) : (
            <ul className="manager-list">
              {managers.map((manager) => (
                <li key={manager.id} className="manager-list__item">
                  <div className="manager-list__head">
                    <span>
                      <strong>{manager.name}</strong> <Badge tone={manager.active ? "success" : "neutral"}>{manager.active ? "active" : "inactive"}</Badge>
                      <div className="muted">
                        {manager.projectName ? `Runs ${manager.projectName}` : "Not assigned to a project"}
                        {manager.phone ? ` - ${manager.phone}` : ""}
                        {manager.email ? ` - ${manager.email}` : ""}
                      </div>
                    </span>
                    <span className="row-actions">
                      <details className="row-edit">
                        <summary className="button button--ghost button--small">Edit</summary>
                        <ManagerEditForm manager={manager} />
                      </details>
                      <ManagerRemover manager={manager} freeManagers={managers.filter((m) => m.active && m.id !== manager.id && m.projectId === null)} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </details>
    </>
  );
}
