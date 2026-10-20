import { StatusSelect } from "@/components/forms/StatusSelect";
import { EmptyState } from "@/components/ui/PageHeader";
import type { Agent, Campaign, Lead } from "@/models/sales";
import { formatDate, phoneHref } from "@/utils/format";

const stages = ["new", "contacted", "site-visit", "negotiation", "won", "lost"];

export function LeadTable({
  leads,
  agents,
  campaigns,
  projectNames,
  editable = true,
}: {
  leads: Lead[];
  agents: Agent[];
  campaigns: Campaign[];
  projectNames: Record<string, string>;
  editable?: boolean;
}) {
  if (leads.length === 0) return <EmptyState>No leads yet.</EmptyState>;
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Lead</th>
            <th>Project</th>
            <th>Source</th>
            <th>Agent</th>
            <th>Date</th>
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
              </td>
              <td>{projectNames[lead.projectId] ?? "-"}</td>
              <td>
                {lead.source}
                {lead.campaignId ? <div className="muted">{campaignName.get(lead.campaignId)}</div> : null}
              </td>
              <td>{lead.agentId ? agentName.get(lead.agentId) : <span className="muted">Unassigned</span>}</td>
              <td>{formatDate(lead.createdAt)}</td>
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
