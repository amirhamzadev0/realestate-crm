import { z } from "zod";
import type { Agent, Campaign, Lead, LeadStatus, Sale, SalesReport } from "@/models/sales";
import type { ProjectRepository, SalesRepository } from "@/repositories/contracts";
import { AppError, notFound } from "@/utils/errors";
import { newId, today } from "@/utils/id";

export const leadStatusSchema = z.enum(["new", "contacted", "site-visit", "negotiation", "won", "lost"]);

export const leadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(40),
  projectId: z.string().min(1),
  source: z.enum(["facebook", "instagram", "walk-in", "referral", "website"]),
  campaignId: z.string().nullable().default(null),
  agentId: z.string().nullable().default(null),
});

export const saleSchema = z.object({
  projectId: z.string().min(1),
  agentId: z.string().min(1),
  leadId: z.string().nullable().default(null),
  unit: z.string().trim().min(1).max(60),
  price: z.number().positive().max(10_000_000_000),
});

export const agentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).default(""),
  commissionRate: z.number().min(0).max(20),
});

export const commissionFor = (price: number, ratePercent: number) => Math.round((price * ratePercent) / 100);

export class SalesService {
  constructor(
    private repo: SalesRepository,
    private projects: ProjectRepository,
  ) {}

  listAgents(): Promise<Agent[]> {
    return this.repo.listAgents();
  }

  listCampaigns(): Promise<Campaign[]> {
    return this.repo.listCampaigns();
  }

  listSales(): Promise<Sale[]> {
    return this.repo.listSales();
  }

  async listLeads(filter?: { projectId?: string; status?: LeadStatus }): Promise<Lead[]> {
    const leads = await this.repo.listLeads();
    return leads.filter(
      (l) => (!filter?.projectId || l.projectId === filter.projectId) && (!filter?.status || l.status === filter.status),
    );
  }

  async addAgent(input: unknown): Promise<Agent> {
    return this.repo.saveAgent({ ...agentSchema.parse(input), id: newId("ag"), active: true });
  }

  async getAgent(id: string): Promise<Agent> {
    const agent = (await this.repo.listAgents()).find((a) => a.id === id);
    if (!agent) throw notFound("Agent");
    return agent;
  }

  async updateAgent(id: string, input: unknown): Promise<Agent> {
    const existing = await this.getAgent(id);
    return this.repo.saveAgent({ ...existing, ...agentSchema.parse(input) });
  }

  /** Agents are deactivated, not deleted, so past sales and commission stay intact. */
  async removeAgent(id: string): Promise<void> {
    const existing = await this.getAgent(id);
    await this.repo.saveAgent({ ...existing, active: false });
  }

  async addLead(input: unknown): Promise<Lead> {
    const data = leadSchema.parse(input);
    if (!(await this.projects.findById(data.projectId))) throw notFound("Project");
    return this.repo.saveLead({ ...data, id: newId("l"), status: "new", createdAt: today() });
  }

  async setLeadStatus(id: string, status: unknown): Promise<Lead> {
    const updated = await this.repo.setLeadStatus(id, leadStatusSchema.parse(status));
    if (!updated) throw notFound("Lead");
    return updated;
  }

  /** Records a sale and marks the originating lead as won. */
  async recordSale(input: unknown): Promise<Sale> {
    const data = saleSchema.parse(input);
    if (!(await this.projects.findById(data.projectId))) throw notFound("Project");
    if (!(await this.repo.listAgents()).some((a) => a.id === data.agentId)) throw notFound("Agent");
    if (data.leadId) {
      if (!(await this.repo.setLeadStatus(data.leadId, "won"))) throw new AppError("Lead not found", 404);
    }
    return this.repo.saveSale({ ...data, id: newId("sl"), date: today() });
  }

  async report(projectId?: string): Promise<SalesReport> {
    const [agents, campaigns, allLeads, allSales] = await Promise.all([
      this.repo.listAgents(),
      this.repo.listCampaigns(),
      this.repo.listLeads(),
      this.repo.listSales(),
    ]);
    const leads = projectId ? allLeads.filter((l) => l.projectId === projectId) : allLeads;
    const sales = projectId ? allSales.filter((s) => s.projectId === projectId) : allSales;
    const rate = new Map(agents.map((a) => [a.id, a.commissionRate]));

    // Removed agents stay in the report only while they have sales (commission still owed).
    const agentRows = agents
      .filter((agent) => agent.active || sales.some((s) => s.agentId === agent.id))
      .map((agent) => {
        const own = sales.filter((s) => s.agentId === agent.id);
        return {
          agentId: agent.id,
          agentName: agent.name,
          sales: own.length,
          revenue: own.reduce((sum, s) => sum + s.price, 0),
          commission: own.reduce((sum, s) => sum + commissionFor(s.price, rate.get(s.agentId) ?? 0), 0),
          leads: leads.filter((l) => l.agentId === agent.id).length,
        };
      });

    const campaignRows = campaigns
      .filter((c) => !projectId || c.projectId === projectId)
      .map((campaign) => {
        const own = leads.filter((l) => l.campaignId === campaign.id);
        return {
          campaignId: campaign.id,
          name: campaign.name,
          leads: own.length,
          won: own.filter((l) => l.status === "won").length,
          budget: campaign.budget,
          costPerLead: own.length ? Math.round(campaign.budget / own.length) : 0,
        };
      });

    return {
      totalRevenue: sales.reduce((sum, s) => sum + s.price, 0),
      totalCommission: agentRows.reduce((sum, a) => sum + a.commission, 0),
      totalSales: sales.length,
      totalLeads: leads.length,
      conversionRate: leads.length ? Math.round((leads.filter((l) => l.status === "won").length / leads.length) * 100) : 0,
      agents: agentRows,
      campaigns: campaignRows,
    };
  }
}
