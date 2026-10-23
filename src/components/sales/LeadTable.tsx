import { AssignLeadSelect } from "@/components/forms/AssignLeadSelect";
import { StatusSelect } from "@/components/forms/StatusSelect";
import { EmptyState } from "@/components/ui/PageHeader";
import { LeadContactCounts } from "@/components/sales/LeadContactCounts";
import type { Agent, Lead, LeadContactSummary } from "@/models/sales";
import { formatDate, phoneHref } from "@/utils/format";

const stages = ["new", "contacted", "site-visit", "negotiation", "won", "lost"];

export function LeadTable({
  leads,
  agents,
  projectNames,
  editable = true,
}: {
  leads: (Lead & { contacts?: LeadContactSummary })[];
  agents: Agent[];
  projectNames: Record<string, string>;
  editable?: boolean;
}) {
  if (leads.length === 0) return <EmptyState>No leads yet.</EmptyState>;
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const activeAgents = agents.filter((a) => a.active);

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Lead</th>
            <th>Project</th>
            <th>Source</th>
            <th>Forward to agent</th>
            <th>Date</th>
            <th>Contacted</th>
            <th>Stage</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id}>
              <td>
                {lead.name}
                <div>
                  <a className="muted" href={phoneHref(lead.phone)}>
                    {lead.phone}
                  </a>
                </div>
                {lead.email ? <div className="muted">{lead.email}</div> : null}
                {lead.note ? <div className="muted">{lead.note}</div> : null}
              </td>
              <td>{projectNames[lead.projectId] ?? "-"}</td>
              <td>{lead.source}</td>
              <td>
                {editable ? (
                  <AssignLeadSelect leadId={lead.id} agentId={lead.agentId} agents={activeAgents} />
                ) : lead.agentId ? (
                  agentName.get(lead.agentId)
                ) : (
                  <span className="muted">Unassigned</span>
                )}
                {lead.agentId && lead.assignedAt ? <div className="muted">forwarded {formatDate(lead.assignedAt)}</div> : null}
              </td>
              <td>{formatDate(lead.createdAt)}</td>
              <td>
                <LeadContactCounts contacts={lead.contacts} />
              </td>
              <td>
                {editable ? (
                  <StatusSelect operation="setLeadStatus" id={lead.id} value={lead.status} options={stages} />
                ) : (
                  lead.status
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
