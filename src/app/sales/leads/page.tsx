import type { Metadata } from "next";
import { LeadForm } from "@/components/forms/LeadForm";
import { LeadImport } from "@/components/forms/LeadImport";
import { ProjectLeadAssign } from "@/components/forms/ProjectLeadAssign";
import { ShareLeadsEqually } from "@/components/forms/ShareLeadsEqually";
import { LeadTable } from "@/components/sales/LeadTable";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getLeadsWorkspace } from "@/viewmodels/sales.viewmodel";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ project?: string; agent?: string; q?: string }> }) {
  const query = await searchParams;
  const { agents, activeAgents, projects, projectNames, byProject, total, project, matching, matchingCount, shownAll } = await getLeadsWorkspace(query);
  const unassigned = byProject.reduce((sum, p) => sum + p.unassigned, 0);
  const filtered = !!(query.project || query.agent || query.q);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Add leads one by one or upload a whole file, then forward them to the agents: one by one, a whole project to one agent, or equally among the agents. The agent sees them in their portal."
      />
      <Card title="Upload leads from a CSV file">
        <LeadImport projects={projects.map((p) => ({ id: p.id, name: p.name, slug: p.slug }))} />
      </Card>

      <Card title={`Leads by project (${total} in all, ${unassigned} not forwarded yet)`}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th className="num">Leads</th>
                <th className="num">Not forwarded</th>
                <th>With the agents</th>
                <th>Give the whole project to one agent</th>
              </tr>
            </thead>
            <tbody>
              {byProject.map(({ project: p, total: count, unassigned: free, open, perAgent }) => (
                <tr key={p.id}>
                  <td>
                    <a className="link" href={`/sales/leads?project=${p.slug}`}>
                      {p.name}
                    </a>
                  </td>
                  <td className="num">{count}</td>
                  <td className="num">{free}</td>
                  <td>{perAgent.length ? perAgent.map((a) => `${a.name} ${a.count}`).join(", ") : <span className="muted">-</span>}</td>
                  <td>
                    {count > 0 ? <ProjectLeadAssign projectId={p.id} projectName={p.name} unassigned={free} open={open} agents={activeAgents} /> : <span className="muted">No leads</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Share leads equally among agents">
        <ShareLeadsEqually projects={byProject.map((p) => ({ id: p.project.id, name: p.project.name, unassigned: p.unassigned }))} agents={activeAgents} />
      </Card>

      <Card title="Add a lead">
        <LeadForm projects={projects} agents={activeAgents} />
      </Card>

      <form className="inline-form" method="get">
        <label className="field">
          <span className="field__label">Search a lead</span>
          <input name="q" type="search" defaultValue={query.q ?? ""} placeholder="Name or phone" />
        </label>
        <label className="field">
          <span className="field__label">Project</span>
          <select name="project" defaultValue={project?.slug ?? ""}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Agent</span>
          <select name="agent" defaultValue={query.agent ?? ""}>
            <option value="">Everyone</option>
            <option value="none">Not forwarded yet</option>
            {activeAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button button--small">
          Show
        </button>
        {filtered ? (
          <a className="button button--ghost button--small" href="/sales/leads">
            Clear
          </a>
        ) : null}
      </form>
      <Card title={`${filtered ? "Matching leads" : "All leads"} (${matchingCount}, by project)${shownAll ? "" : ": the first 200 are shown"}`}>
        <LeadTable leads={matching} agents={agents} projectNames={projectNames} />
      </Card>
    </>
  );
}
