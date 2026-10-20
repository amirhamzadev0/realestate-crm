import "server-only";

import { cache } from "react";
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
  const [leads, agents, campaigns, projects] = await Promise.all([
    salesService.listLeads(),
    salesService.listAgents(),
    salesService.listCampaigns(),
    projectService.list(),
  ]);
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  return { leads, agents, activeAgents: agents.filter((a) => a.active), campaigns, projects, projectNames };
});

export const getAgentsPage = cache(async () => {
  const [report, agents, changes] = await Promise.all([
    salesService.report(),
    salesService.listAgents(),
    changeRequestService.list({ kind: "agent" }),
  ]);
  const pendingIds = changes.filter((c) => c.status === "pending" && c.targetId).map((c) => c.targetId as string);
  return { performance: report.agents, agents: agents.filter((a) => a.active), changes, pendingIds };
});

export const getCampaignsPage = cache(async () => {
  const [report, campaigns, projects] = await Promise.all([
    salesService.report(),
    salesService.listCampaigns(),
    projectService.list(),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  return {
    rows: campaigns.map((campaign) => ({
      campaign,
      projectName: projectName.get(campaign.projectId) ?? "Unknown",
      performance: report.campaigns.find((c) => c.campaignId === campaign.id),
    })),
  };
});

export const getSalesReportPage = cache(async () => {
  const [report, sales, agents, projects] = await Promise.all([
    salesService.report(),
    salesService.listSales(),
    salesService.listAgents(),
    projectService.list(),
  ]);
  const agentName = new Map(agents.map((a) => [a.id, a]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  return {
    report,
    projects,
    agents: agents.filter((a) => a.active),
    sales: [...sales]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((sale) => ({
        ...sale,
        agentName: agentName.get(sale.agentId)?.name ?? "Unknown",
        projectName: projectName.get(sale.projectId) ?? "Unknown",
        commission: Math.round((sale.price * (agentName.get(sale.agentId)?.commissionRate ?? 0)) / 100),
      })),
  };
});
