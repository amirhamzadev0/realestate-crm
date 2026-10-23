import "server-only";

import { cache } from "react";
import { saleUnit } from "@/models/project";
import type { AgentReportRow } from "@/models/sales";
import { addMonths } from "@/utils/date";
import { today } from "@/utils/id";
import { changeRequestService, projectService, salesService } from "@/server/container";

export const getSalesDashboard = cache(async () => {
  const [report, leads, projects] = await Promise.all([
    salesService.report(),
    salesService.listLeads(),
    projectService.list(),
  ]);
  return { report, recentLeads: leads.slice(0, 5), projects };
});

export const getLeadsPage = cache(async () => {
  const [leads, agents, projects, contacts] = await Promise.all([
    salesService.listLeads(),
    salesService.listAgents(),
    projectService.list(),
    salesService.contactSummary(),
  ]);
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  return {
    leads: leads.map((lead) => ({ ...lead, contacts: contacts.get(lead.id) ?? { calls: 0, whatsapp: 0 } })),
    agents,
    activeAgents: agents.filter((a) => a.active),
    projects,
    projectNames,
  };
});

export const getAgentsPage = cache(async () => {
  const [report, agents, managers] = await Promise.all([salesService.report(), salesService.listAgents(), salesService.listSalesManagers()]);
  const managerName = Object.fromEntries(managers.map((m) => [m.id, m.name]));
  return {
    performance: report.agents,
    agents: agents.filter((a) => a.active).map((agent) => ({ ...agent, managerName: agent.managerId ? (managerName[agent.managerId] ?? "-") : "-" })),
    managers: managers.filter((m) => m.active),
  };
});

export const getSalesReportPage = cache(async () => {
  const [report, sales, agents, projects, managers] = await Promise.all([
    salesService.report(),
    salesService.listSales(),
    salesService.listAgents(),
    projectService.list(),
    salesService.listSalesManagers(),
  ]);
  const agentName = new Map(agents.map((a) => [a.id, a]));
  const managerById = new Map(managers.map((m) => [m.id, m]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const projectType = new Map(projects.map((p) => [p.id, p.type]));
  return {
    report,
    projects: await salesService.saleProjects(projects),
    // Who can be named as the seller: an agent (earns commission) or a sales manager (selling himself, no commission).
    sellers: [
      ...agents.filter((a) => a.active).map((a) => ({ value: `agent:${a.id}`, label: `${a.name} - agent (${a.commissionRate}%)` })),
      ...managers.filter((m) => m.active).map((m) => ({ value: `manager:${m.id}`, label: `${m.name} - sales manager (no commission)` })),
    ],
    sales: [...sales]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((sale) => ({
        ...sale,
        agentName: sale.agentId
          ? (agentName.get(sale.agentId)?.name ?? "Unknown")
          : sale.soldByManagerId
            ? `${managerById.get(sale.soldByManagerId)?.name ?? "Sales manager"} (manager)`
            : "Direct sale",
        projectName: projectName.get(sale.projectId) ?? "Unknown",
        areaUnit: saleUnit[projectType.get(sale.projectId) ?? "high-rise"].area,
        commission: Math.round((sale.price * ((sale.agentId && agentName.get(sale.agentId)?.commissionRate) || 0)) / 100),
      })),
  };
});

/** Everything one agent sees in their own portal. Returns null for an agent that does not exist. */
export const getAgentPortal = cache(async (agentId: string) => {
  const agent = (await salesService.listAgents()).find((a) => a.id === agentId);
  if (!agent) return null;
  const [portal, projects] = await Promise.all([salesService.agentPortal(agentId), projectService.list()]);
  const projectName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  return {
    ...portal,
    followUps: await salesService.followUps(agentId),
    projectSlug: Object.fromEntries(projects.map((p) => [p.id, p.slug])),
    leads: [...portal.leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    sales: [...portal.sales].sort((a, b) => b.date.localeCompare(a.date)),
    projectName,
  };
});

/**
 * The agent reports: an overall report, the report of one month (live while the month runs, as saved once it is over),
 * the history of saved months and a month-by-month table of units sold per agent so progress is easy to see.
 */
export const getAgentReportsPage = cache(async (month?: string, agent?: string) => {
  const current = today().slice(0, 7);
  const saved = await salesService.savedMonthlyReports(); // also saves every month that has ended
  const savedByPeriod = new Map(saved.map((r) => [r.period, r]));

  /** A month's rows: the saved report when there is a final one, otherwise worked out now. */
  const rowsFor = async (period: string): Promise<AgentReportRow[]> => {
    const snapshot = savedByPeriod.get(period);
    return snapshot && snapshot.final ? snapshot.rows : salesService.monthlyReport(period);
  };

  const selected = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : current;
  const previous = addMonths(`${selected}-01`, -1).slice(0, 7);
  const recent = Array.from({ length: 6 }, (_, i) => addMonths(`${current}-01`, i - 5).slice(0, 7));

  const [overall, selectedRows, previousRows, recentRows] = await Promise.all([
    salesService.agentReport(),
    rowsFor(selected),
    rowsFor(previous),
    Promise.all(recent.map(rowsFor)),
  ]);

  // One agent, every month from the first one with any activity until now: the saved report of each finished month.
  const firstPeriod = [...saved.map((r) => r.period), current].sort()[0];
  const allPeriods: string[] = [];
  for (let period = firstPeriod; period <= current; period = addMonths(`${period}-01`, 1).slice(0, 7)) allPeriods.push(period);
  const chosen = agent ? overall.find((row) => row.key === agent) : undefined;
  const agentRows = chosen ? await Promise.all(allPeriods.map(rowsFor)) : [];
  const history = chosen
    ? allPeriods
        .map((period, index) => ({
          period,
          final: period !== current,
          row: agentRows[index].find((row) => row.key === chosen.key) ?? { key: chosen.key, kind: chosen.kind, name: chosen.name, leads: 0, calls: 0, whatsapp: 0, units: 0, revenue: 0, commission: 0 },
        }))
        .reverse()
    : [];

  // Everyone who sold anything, ever, so a month in which an agent sold nothing still shows them with 0.
  const people = overall.map((row) => ({ key: row.key, name: row.name, kind: row.kind }));
  return {
    current,
    selected,
    previous,
    isLive: selected === current,
    savedAt: savedByPeriod.get(selected)?.generatedAt,
    overall,
    agentHistory: chosen ? { key: chosen.key, name: chosen.name, months: history } : null,
    selectedRows,
    previousUnits: Object.fromEntries(previousRows.map((r) => [r.key, r.units])),
    months: [...new Set([current, ...saved.map((r) => r.period)])].sort().reverse(),
    history: saved.map((r) => ({
      period: r.period,
      final: r.final,
      generatedAt: r.generatedAt,
      units: r.rows.reduce((sum, row) => sum + row.units, 0),
      revenue: r.rows.reduce((sum, row) => sum + row.revenue, 0),
    })),
    progress: {
      months: recent,
      people: people.map((person) => ({
        ...person,
        units: recent.map((_, index) => recentRows[index].find((row) => row.key === person.key)?.units ?? 0),
      })),
    },
  };
});

/** One agent's report for one month, with the project names for the sales. Null when the agent does not exist. */
export const getAgentMonthDetail = cache(async (agentId: string, period: string) => {
  const agent = (await salesService.listAgents()).find((a) => a.id === agentId);
  if (!agent) return null;
  const [detail, projects, saved] = await Promise.all([
    salesService.agentMonthDetail(agentId, period),
    projectService.list(),
    salesService.savedMonthlyReports(),
  ]);
  const snapshot = saved.find((r) => r.period === period);
  return {
    ...detail,
    // A finished month shows the numbers as they were saved; a running month shows today's.
    row: snapshot?.final ? (snapshot.rows.find((r) => r.key === agentId) ?? detail.row) : detail.row,
    savedAt: snapshot?.final ? snapshot.generatedAt : undefined,
    projectName: Object.fromEntries(projects.map((p) => [p.id, p.name])),
  };
});

/** An agent's open follow-ups, nearest first, with the project name for each. */
export const getAgentFollowUps = cache(async (agentId: string) => {
  const [followUps, projects] = await Promise.all([salesService.followUps(agentId), projectService.list()]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  return followUps.map((f) => ({
    contactId: f.contactId,
    leadId: f.leadId,
    leadName: f.leadName,
    leadPhone: f.leadPhone,
    projectName: projectName.get(f.projectId) ?? "",
    at: f.at,
    comment: f.comment,
  }));
});
