import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeadContactMenu } from "@/components/forms/LeadContactMenu";
import Link from "next/link";
import { LeadContactCounts } from "@/components/sales/LeadContactCounts";
import { LocalTime } from "@/components/sales/LocalTime";
import { ScrollToHighlight } from "@/components/sales/ScrollToHighlight";
import { Badge } from "@/components/ui/Badge";
import { Card, StatCard } from "@/components/ui/Card";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { formatCompactMoney, formatDate, formatMoney } from "@/utils/format";
import { getAgentPortal } from "@/viewmodels/sales.viewmodel";

export const metadata: Metadata = { title: "My portal" };

/** An agent's own portal: their numbers, their leads and their sales with the commission they earned. Read only. */
export default async function AgentPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notify?: string; lead?: string }>;
}) {
  const portal = await getAgentPortal((await params).id);
  if (!portal) notFound();
  const { agent, stats, leads, sales, projectName, projectSlug, followUps } = portal;

  // Coming from the notification bell (?notify=due) or a name in the banner (?lead=...): the clients whose follow-up is due,
  // or that one client, are highlighted in the list, with the call and message options already open.
  const query = await searchParams;
  const now = Date.now();
  const dueFollowUps = followUps.filter((f) => new Date(f.at).getTime() <= now);
  const highlighted = new Map<string, (typeof followUps)[number] | null>(); // null: highlighted, but no follow-up note to show
  if (query.notify === "due") for (const f of dueFollowUps) if (!highlighted.has(f.leadId)) highlighted.set(f.leadId, f);
  if (query.lead) {
    const own = followUps.find((f) => f.leadId === query.lead);
    if (own) highlighted.set(query.lead, own);
    else if (leads.some((l) => l.id === query.lead)) highlighted.set(query.lead, null);
  }
  const firstHighlighted = leads.find((l) => highlighted.has(l.id))?.id;

  return (
    <>
      <PageHeader
        title={`Welcome, ${agent.name}`}
        subtitle={`Your commission rate is ${agent.commissionRate}% of each sale`}
        actions={
          <Link href={`/agent/${agent.id}/follow-ups`} className="button">
            Upcoming follow-ups ({followUps.length})
          </Link>
        }
      />
      <div className="grid grid--4">
        <StatCard label="My leads" value={String(stats.leads)} hint={`${stats.conversionRate}% became sales`} />
        <StatCard label="Units sold" value={String(stats.sales)} />
        <StatCard label="Sales value" value={formatCompactMoney(stats.revenue)} tone="positive" />
        <StatCard label="My commission" value={formatCompactMoney(stats.commission)} tone="positive" />
      </div>

      {highlighted.size > 0 ? (
        <section className="notice notice--danger" role="status">
          <strong>
            {query.notify === "due"
              ? dueFollowUps.length === 1
                ? "1 client is waiting for your follow-up"
                : `${dueFollowUps.length} clients are waiting for your follow-up`
              : "Follow up this client"}
            :
          </strong>{" "}
          they are highlighted below. Click the phone number to call or message them, then write a note.
        </section>
      ) : null}
      {firstHighlighted ? <ScrollToHighlight /> : null}
      <Card
        title="My leads (click a phone number to message or call; press Sell when the client buys)"
        action={
          <Link href={`/agent/${agent.id}/sell`} className="button button--small">
            Sell a unit
          </Link>
        }
      >
        {leads.length === 0 ? (
          <EmptyState>No leads assigned to you yet.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Forwarded</th>
                  <th>Lead</th>
                  <th>Project</th>
                  <th>Source</th>
                  <th>Contacted</th>
                  <th>Stage</th>
                  <th>Sell</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} id={`lead-${lead.id}`} className={highlighted.has(lead.id) ? "lead-row--highlight" : undefined}>
                    <td>{formatDate(lead.assignedAt ?? lead.createdAt)}</td>
                    <td>
                      {lead.name}
                      {highlighted.get(lead.id) ? (
                        <div className="follow-up__due">
                          Follow-up due <LocalTime iso={highlighted.get(lead.id)!.at} />
                          {highlighted.get(lead.id)!.comment ? <div className="contact-comment">&ldquo;{highlighted.get(lead.id)!.comment}&rdquo;</div> : null}
                        </div>
                      ) : null}
                      <LeadContactMenu leadId={lead.id} phone={lead.phone} defaultOpen={lead.id === firstHighlighted} />
                      {lead.email ? <div className="muted">{lead.email}</div> : null}
                      {lead.note ? <div className="muted">{lead.note}</div> : null}
                    </td>
                    <td>{projectName[lead.projectId] ?? "-"}</td>
                    <td>{lead.source}</td>
                    <td>
                      <LeadContactCounts contacts={lead.contacts} />
                      {lead.history.length > 0 ? (
                        <details className="contact-history">
                          <summary>History ({lead.history.length})</summary>
                          <ul>
                            {lead.history.map((entry) => (
                              <li key={entry.id}>
                                <strong>{entry.channel === "call" ? "Call" : "WhatsApp"}</strong> - <LocalTime iso={entry.at} />
                                {entry.comment ? <div className="contact-comment">&ldquo;{entry.comment}&rdquo;</div> : null}
                                {entry.followUpAt ? (
                                  <div className="muted">
                                    Follow up: <LocalTime iso={entry.followUpAt} /> {entry.followUpDone ? "(done)" : ""}
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </td>
                    <td>
                      <Badge>{lead.status}</Badge>
                    </td>
                    <td>
                      {lead.status === "won" ? (
                        <span className="muted">Sold</span>
                      ) : (
                        <Link
                          className="button button--small"
                          href={`/agent/${agent.id}/sell?lead=${lead.id}${projectSlug[lead.projectId] ? `&project=${projectSlug[lead.projectId]}` : ""}`}
                        >
                          Sell
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="My sales and commission">
        {sales.length === 0 ? (
          <EmptyState>You have not made a sale yet.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Unit</th>
                  <th className="num">Price</th>
                  <th className="num">My commission</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id}>
                    <td>{formatDate(sale.date)}</td>
                    <td>{projectName[sale.projectId] ?? "-"}</td>
                    <td>
                      {sale.unit}
                      {sale.floor ? <div className="muted">Floor {sale.floor}</div> : null}
                    </td>
                    <td className="num">{formatMoney(sale.price)}</td>
                    <td className="num">
                      <Badge tone="info">{formatMoney(sale.commission)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
