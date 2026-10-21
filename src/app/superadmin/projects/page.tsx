import type { Metadata } from "next";
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
        {rows.map(({ project, accounts, hr }) => (
          <div key={project.id} className="project-slot">
            <ProjectCard project={project} accounts={accounts} hr={hr} href={`/projects/${project.slug}`} />
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

      <h2 className="section-title">Managers</h2>
      <Card title="Project managers">
        {managers.length === 0 ? (
          <EmptyState>No managers yet.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Runs project</th>
                  <th>Status</th>
                  <th>Edit</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((manager) => (
                  <tr key={manager.id}>
                    <td>{manager.name}</td>
                    <td>
                      {manager.phone || "-"}
                      {manager.email ? <div className="muted">{manager.email}</div> : null}
                    </td>
                    <td>{manager.projectName ?? <span className="muted">Not assigned</span>}</td>
                    <td>
                      <Badge tone={manager.active ? "success" : "neutral"}>{manager.active ? "active" : "inactive"}</Badge>
                    </td>
                    <td>
                      <details className="row-edit">
                        <summary className="button button--ghost button--small">Edit</summary>
                        <ManagerEditForm manager={manager} />
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Add a new manager">
        <NewManagerForm />
      </Card>
    </>
  );
}
