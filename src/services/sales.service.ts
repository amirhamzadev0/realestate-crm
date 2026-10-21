import { z } from "zod";
import { categoryLabels, plotCategories, rateFor, type Project, type ProjectUnit, type SaleProject } from "@/models/project";
import type { Agent, Campaign, Lead, LeadStatus, Sale, SalesReport } from "@/models/sales";
import type { AccountRepository, ProjectRepository, SalesRepository } from "@/repositories/contracts";
import { AppError, notFound } from "@/utils/errors";
import { newId, today } from "@/utils/id";
import { discountProblem, priceUnit } from "@/utils/pricing";

export const leadStatusSchema = z.enum(["new", "contacted", "site-visit", "negotiation", "won", "lost"]);

export const leadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(40),
  projectId: z.string().min(1),
  source: z.enum(["facebook", "instagram", "walk-in", "referral", "website"]),
  campaignId: z.string().nullable().default(null),
  agentId: z.string().nullable().default(null),
});

const phoneSchema = z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, "Enter a valid phone number");
const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email").max(254);
/** A Pakistani CNIC has 13 digits; it is stored as 12345-1234567-1 whatever way it was typed. */
const cnicSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length === 13, "CNIC must have 13 digits")
  .transform((v) => `${v.slice(0, 5)}-${v.slice(5, 12)}-${v.slice(12)}`);
const optional = <T extends z.ZodType<string>>(schema: T) => z.union([z.literal(""), schema]).default("");

export const saleSchema = z.object({
  projectId: z.string().min(1),
  agentId: z.string().min(1),
  leadId: z.string().nullable().default(null),
  category: z.enum(plotCategories),
  buyer: z.string().trim().max(120).default(""),
  buyerPhone: optional(phoneSchema),
  buyerCnic: optional(cnicSchema),
  buyerEmail: optional(emailSchema),
  unit: z.string().trim().min(1).max(60),
  floor: z.string().trim().max(20).default(""),
  // A high-rise unit with a defined size ignores this: the size comes from the unit itself.
  area: z.number().positive().max(10_000_000).optional(),
});

/** A sale the Super Admin makes without an agent: no agent, no lead, no commission. */
export const directSaleSchema = saleSchema.omit({ agentId: true, leadId: true }).extend({
  // A discount is a fixed amount off the total, a lower rate per sq ft / marla, or a percentage off the total.
  discountMode: z.enum(["none", "amount", "rate", "percent"]).default("none"),
  discountValue: z.number().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  buyer: z.string().trim().min(1, "Buyer name is required").max(120),
  buyerPhone: phoneSchema,
  buyerCnic: cnicSchema,
  buyerEmail: emailSchema,
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
    private accounts: AccountRepository,
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

  /** Records an agent's sale and marks the originating lead as won. */
  async recordSale(input: unknown): Promise<Sale> {
    const data = saleSchema.parse(input);
    if (!(await this.repo.listAgents()).some((a) => a.id === data.agentId)) throw notFound("Agent");
    return this.sell(data, data.agentId, data.leadId);
  }

  /** The Super Admin sells a unit straight to a buyer. */
  async recordDirectSale(input: unknown): Promise<Sale> {
    return this.sell(directSaleSchema.parse(input), null, null);
  }

  /** How many units of each project have been sold. */
  async unitsSold(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const sale of await this.repo.listSales()) counts.set(sale.projectId, (counts.get(sale.projectId) ?? 0) + 1);
    return counts;
  }

  /** Units sold per plot type, for every project: projectId -> category -> count. */
  async soldByCategory(): Promise<Map<string, Record<string, number>>> {
    const counts = new Map<string, Record<string, number>>();
    for (const sale of await this.repo.listSales()) {
      const entry = counts.get(sale.projectId) ?? {};
      entry[sale.category] = (entry[sale.category] ?? 0) + 1;
      counts.set(sale.projectId, entry);
    }
    return counts;
  }

  /** The units of high-rise projects that are still free: projectId -> unsold units. */
  async availableUnits(projects: Project[]): Promise<Map<string, ProjectUnit[]>> {
    const sold = new Map<string, Set<string>>();
    for (const sale of await this.repo.listSales()) {
      const names = sold.get(sale.projectId) ?? new Set<string>();
      names.add(sale.unit.toLowerCase());
      sold.set(sale.projectId, names);
    }
    return new Map(projects.map((p) => [p.id, p.units.filter((u) => !sold.get(p.id)?.has(u.unit.toLowerCase()))]));
  }

  /** Projects in the shape the sale form needs: prices and the units still free. */
  async saleProjects(projects: Project[]): Promise<SaleProject[]> {
    const free = await this.availableUnits(projects);
    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      rates: p.rates,
      hasUnitList: p.type === "high-rise" && p.units.length > 0,
      availableUnits: free.get(p.id) ?? [],
    }));
  }

  /**
   * Every sale, whoever makes it: takes one unit out of the project's available units and credits the
   * price to the project's accounts. The price always comes from the project's rate for the chosen plot
   * category (and the size of the unit), never from the browser.
   */
  private async sell(
    data: z.output<typeof saleSchema> | z.output<typeof directSaleSchema>,
    agentId: string | null,
    leadId: string | null,
  ): Promise<Sale> {
    const project = await this.projects.findById(data.projectId);
    if (!project) throw notFound("Project");
    const rate = rateFor(project, data.category);
    if (rate === undefined) {
      throw new AppError(`${categoryLabels[data.category]} is not offered in ${project.name}. Set its price in the project first.`, 409);
    }
    const highRise = project.type === "high-rise";

    // A high-rise with a unit list sells those units: the number picks the floor, type and size.
    let unitName = data.unit;
    let floor = data.floor;
    let area = data.area;
    if (highRise && project.units.length) {
      const defined = project.units.find((u) => u.unit.toLowerCase() === data.unit.toLowerCase());
      if (!defined) throw new AppError(`Unit ${data.unit} does not exist in ${project.name}`, 409);
      if (defined.category !== data.category) {
        throw new AppError(`${defined.unit} is a ${defined.category} unit, not ${data.category}`, 409);
      }
      if (data.floor && data.floor.toLowerCase() !== defined.floor.toLowerCase()) {
        throw new AppError(`${defined.unit} is on floor ${defined.floor}, not floor ${data.floor}`, 409);
      }
      unitName = defined.unit;
      floor = defined.floor;
      area = defined.area;
    } else {
      if (highRise && !data.floor) throw new AppError("Floor is required for a high-rise unit", 400);
      if (area === undefined) throw new AppError(highRise ? "Area is required" : "Plot size is required", 400);
    }

    const projectSales = (await this.repo.listSales()).filter((s) => s.projectId === project.id);
    const typeLimit = project.rates.find((r) => r.category === data.category)?.units;
    if (typeLimit !== undefined && projectSales.filter((s) => s.category === data.category).length >= typeLimit) {
      throw new AppError(`All ${typeLimit} ${data.category} units of ${project.name} are sold`, 409);
    }
    if (projectSales.some((s) => s.unit.toLowerCase() === unitName.toLowerCase())) {
      throw new AppError(`${unitName} in ${project.name} is already sold`, 409);
    }
    if (projectSales.length >= project.totalUnits) throw new AppError(`${project.name} has no units left to sell`, 409);

    // Only the Super Admin's direct sale carries a discount.
    const mode = "discountMode" in data ? data.discountMode : "none";
    const value = "discountValue" in data ? data.discountValue : undefined;
    const listPrice = priceUnit(area, rate).listPrice;
    const problem = discountProblem(listPrice, rate, mode, value);
    if (problem) throw new AppError(problem, 400);
    const priced = priceUnit(area, rate, mode, value);
    if (priced.price <= 0) throw new AppError("The price after the discount must be above zero", 400);

    if (leadId && !(await this.repo.setLeadStatus(leadId, "won"))) throw new AppError("Lead not found", 404);

    const sale = await this.repo.saveSale({
      id: newId("sl"),
      projectId: project.id,
      agentId,
      leadId,
      category: data.category,
      unit: unitName,
      ...(data.buyer ? { buyer: data.buyer } : {}),
      ...(data.buyerPhone ? { buyerPhone: data.buyerPhone } : {}),
      ...(data.buyerCnic ? { buyerCnic: data.buyerCnic } : {}),
      ...(data.buyerEmail ? { buyerEmail: data.buyerEmail } : {}),
      ...(highRise ? { floor } : {}),
      area,
      rate,
      listPrice: priced.listPrice,
      ...(mode !== "none" && value !== undefined
        ? { discountMode: mode, discountValue: value, discountAmount: priced.discountAmount }
        : {}),
      price: priced.price,
      date: today(),
    });
    await this.accounts.add({
      id: newId("ac"),
      projectId: project.id,
      date: sale.date,
      type: "sale",
      amount: priced.price,
      description: `Sale of ${highRise ? `unit ${unitName}, floor ${floor}` : `plot ${unitName}`} (${data.category})${
        priced.discountAmount > 0 ? `, ${priced.discountAmount} discount` : ""
      }`,
      party: data.buyer,
    });
    return sale;
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
          commission: own.reduce((sum, s) => sum + commissionFor(s.price, (s.agentId && rate.get(s.agentId)) || 0), 0),
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
