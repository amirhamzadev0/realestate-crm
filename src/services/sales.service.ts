import { z } from "zod";
import { categoryLabels, plotCategories, rateFor, type Project, type ProjectUnit, type SaleProject } from "@/models/project";
import type {
  Agent,
  AgentPerformance,
  AgentReportRow,
  Campaign,
  Lead,
  FollowUp,
  LeadContact,
  LeadContactSummary,
  LeadStatus,
  MonthlyReportSnapshot,
  Sale,
  SalesManager,
  SalesReport,
} from "@/models/sales";
import type { AccountRepository, FinanceRepository, ProjectRepository, SalesRepository } from "@/repositories/contracts";
import type { Installment } from "@/models/finance";
import { buildPlan } from "@/utils/installments";
import { AppError, notFound } from "@/utils/errors";
import { newId, today } from "@/utils/id";
import { withLock } from "@/utils/lock";
import { addMonths } from "@/utils/date";
import { discountProblem, priceUnit } from "@/utils/pricing";
import { matchProject, matchSource } from "@/utils/lead-import";
import { isOpenLead, isUnforwarded } from "@/utils/leads";
import { canonicalPhone } from "@/utils/phone";

export const leadStatusSchema = z.enum(["new", "contacted", "site-visit", "negotiation", "won", "lost"]);

export const leadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(40),
  projectId: z.string().min(1),
  source: z.enum(["facebook", "instagram", "walk-in", "referral", "website"]),
  campaignId: z.string().nullable().default(null),
  agentId: z.string().nullable().default(null),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email").max(254)]).default(""),
  note: z.string().trim().max(500).default(""),
});

export const contactNoteSchema = z.object({
  contactId: z.string().min(1),
  comment: z.string().trim().max(1000).default(""),
  // When the client asked to be contacted again: an ISO date and time, optional. Empty or null clears it.
  followUpAt: z.union([z.iso.datetime(), z.literal(""), z.null()]).optional(),
});

export const logContactSchema = z.object({ leadId: z.string().min(1), channel: z.enum(["call", "whatsapp"]) });

export const assignLeadSchema = z.object({ leadId: z.string().min(1), agentId: z.string().min(1).nullable() });

/** Leave `leadIds` out to share every unassigned lead; leave `agentIds` out to share among every active agent. */
export const assignEquallySchema = z.object({
  projectId: z.string().min(1).optional(), // share only the unassigned leads of this project
  leadIds: z.array(z.string().min(1)).optional(),
  agentIds: z.array(z.string().min(1)).optional(),
});

/** Every lead of a project goes to one agent. By default only the leads nobody has yet; `includeAssigned` takes the project's other open leads from their agents too. */
export const assignProjectSchema = z.object({
  projectId: z.string().min(1),
  agentId: z.string().min(1),
  includeAssigned: z.boolean().default(false),
});

// One request carries at most this many leads. A file can have any number: the upload screen sends it in parts of this size or less.
/** What happens to an agent's open leads when the agent is removed: given to another agent, or put back in "not forwarded". */
export const removeAgentSchema = z.object({
  leads: z.enum(["transfer", "pool"]).optional(),
  toAgentId: z.string().min(1).optional(),
});

export const MAX_IMPORT_LEADS = 1000;

/** Leads read from an uploaded file. The project is named in the file (its name, address or id). */
export const importLeadsSchema = z.object({
  defaultSource: z.enum(["facebook", "instagram", "walk-in", "referral", "website"]).default("website"), // for rows that name no (known) source
  leads: z
    .array(
      z.object({
        line: z.number().int().optional(),
        name: z.string(),
        phone: z.string(),
        project: z.string(),
        source: z.string().optional(),
        email: z.string().optional(),
        note: z.string().optional(),
      }),
    )
    .min(1, "The file has no leads")
    .max(MAX_IMPORT_LEADS, `One request can carry at most ${MAX_IMPORT_LEADS} leads; send a bigger file in parts`),
});

export interface ImportLeadsResult {
  imported: number;
  duplicates: number; // already in the system (same phone in the same project) or repeated in the file
  errors: { line: number; message: string }[]; // rows that could not be imported, with the reason
  byProject: { projectId: string; projectName: string; count: number }[];
}

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

const saleFields = {
  projectId: z.string().min(1),
  agentId: z.string().min(1).optional(), // an agent sold it (commission is owed), or...
  managerId: z.string().min(1).optional(), // ...the sales manager sold it himself (no commission)
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
};

/** A sale by an agent or by the sales manager: exactly one of them. */
export const saleSchema = z
  .object(saleFields)
  .refine((sale) => !!sale.agentId !== !!sale.managerId, { message: "Choose who sold it: an agent or the sales manager", path: ["agentId"] });

/** What a full sale carries: the buyer's details (all required) and, optionally, a discount. */
const fullSaleFields = {
  // A discount is a fixed amount off the total, a lower rate per sq ft / marla, or a percentage off the total.
  discountMode: z.enum(["none", "amount", "rate", "percent"]).default("none"),
  discountValue: z.number().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  buyer: z.string().trim().min(1, "Buyer name is required").max(120),
  buyerPhone: phoneSchema,
  buyerCnic: cnicSchema,
  buyerEmail: emailSchema,
  // Left out: the buyer pays everything now (cash). With a plan: a down payment now and the rest on instalments, and the unit is
  // "booked" until every instalment is paid.
  paymentPlan: z
    .object({
      downPaymentPercent: z.number().gt(0, "The down payment must be above 0%").lt(100, "The down payment must be below 100%"),
      months: z.number().int().min(1).max(360),
      dueDay: z.number().int().min(1).max(28),
      balloonAmount: z.number().positive().max(Number.MAX_SAFE_INTEGER).optional(),
      balloonEveryMonths: z.number().int().min(1).max(120).optional(),
      possessionAmount: z.number().positive().max(Number.MAX_SAFE_INTEGER).optional(),
    })
    .optional(),
};

/** A sale the Super Admin makes without an agent, or a sales manager makes himself (`managerId`): no lead, no commission. */
export const directSaleSchema = z.object(saleFields).omit({ agentId: true, leadId: true }).extend(fullSaleFields);

/** An agent sells a unit, the same way a direct sale is made, usually to one of the leads forwarded to them. Commission is owed to the agent. */
export const agentSaleSchema = z
  .object(saleFields)
  .omit({ managerId: true })
  .extend({ ...fullSaleFields, agentId: z.string().min(1) });

export const agentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).default(""),
  commissionRate: z.number().min(0).max(20),
  managerId: z.string().min(1).nullable().optional(), // the sales manager who creates / owns this agent
});

export const salesManagerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).default(""),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(254)]).default(""),
});

// Forms send "true" / "false" as text; the API may send a real boolean.
const activeFlag = z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]);
export const salesManagerUpdateSchema = salesManagerSchema.extend({ active: activeFlag.default(true) });

export const commissionFor = (price: number, ratePercent: number) => Math.round((price * ratePercent) / 100);

export class SalesService {
  constructor(
    private repo: SalesRepository,
    private projects: ProjectRepository,
    private accounts: AccountRepository,
    private finance?: FinanceRepository,
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

  listSalesManagers(): Promise<SalesManager[]> {
    return this.repo.listSalesManagers();
  }

  async getSalesManager(id: string): Promise<SalesManager> {
    const manager = (await this.repo.listSalesManagers()).find((m) => m.id === id);
    if (!manager) throw notFound("Sales manager");
    return manager;
  }

  /** The Super Admin creates a sales manager for the sales department. */
  async addSalesManager(input: unknown): Promise<SalesManager> {
    return this.repo.saveSalesManager({ ...salesManagerSchema.parse(input), id: newId("sm"), active: true });
  }

  /** Edits a sales manager. One who has active agents cannot be made inactive until the agents are moved or removed. */
  async updateSalesManager(id: string, input: unknown): Promise<SalesManager> {
    const existing = await this.getSalesManager(id);
    const data = salesManagerUpdateSchema.parse(input);
    if (!data.active) {
      const team = (await this.repo.listAgents()).filter((a) => a.managerId === id && a.active);
      if (team.length) throw new AppError(`${existing.name} still has ${team.length} active agents. Move or remove them first.`, 409);
    }
    return this.repo.saveSalesManager({ ...existing, ...data });
  }

  /** The sales manager creates an agent; the agent is on that manager's team. */
  async addAgent(input: unknown): Promise<Agent> {
    const data = agentSchema.parse(input);
    if (data.managerId) {
      const manager = await this.getSalesManager(data.managerId);
      if (!manager.active) throw new AppError(`${manager.name} is inactive and cannot have new agents`, 409);
    }
    return this.repo.saveAgent({ ...data, managerId: data.managerId ?? null, id: newId("ag"), active: true });
  }

  /** What one agent sees in their own portal: their leads, their sales with commission and the totals. */
  async agentPortal(agentId: string): Promise<{
    agent: Agent;
    manager: SalesManager | null;
    stats: AgentPerformance & { conversionRate: number };
    leads: (Lead & { contacts: LeadContactSummary; history: LeadContact[] })[];
    sales: (Sale & { commission: number })[];
  }> {
    const agent = await this.getAgent(agentId);
    const [leads, sales, managers, contacts, contactLog] = await Promise.all([
      this.repo.listLeads(),
      this.repo.listSales(),
      this.repo.listSalesManagers(),
      this.contactSummary(),
      this.repo.listLeadContacts(),
    ]);
    const ownLeads = leads.filter((l) => l.agentId === agent.id);
    const ownSales = sales.filter((s) => s.agentId === agent.id).map((s) => ({ ...s, commission: commissionFor(s.price, agent.commissionRate) }));
    return {
      agent,
      manager: managers.find((m) => m.id === agent.managerId) ?? null,
      stats: {
        agentId: agent.id,
        agentName: agent.name,
        sales: ownSales.length,
        revenue: ownSales.reduce((sum, s) => sum + s.price, 0),
        commission: ownSales.reduce((sum, s) => sum + s.commission, 0),
        leads: ownLeads.length,
        conversionRate: ownLeads.length ? Math.round((ownLeads.filter((l) => l.status === "won").length / ownLeads.length) * 100) : 0,
      },
      leads: ownLeads.map((lead) => ({
        ...lead,
        contacts: contacts.get(lead.id) ?? { calls: 0, whatsapp: 0 },
        history: contactLog.filter((c) => c.leadId === lead.id).sort((a, b) => b.at.localeCompare(a.at)),
      })),
      sales: ownSales,
    };
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

  /**
   * Agents are deactivated, not deleted, so past sales and commission stay intact. An agent who still has open leads (not won and
   * not lost) cannot just disappear with them: `leads: "transfer"` gives them to the active agent `toAgentId`, `leads: "pool"` puts
   * them back in "not forwarded". Without a choice the removal is refused. Won and lost leads stay with the agent for the reports.
   */
  async removeAgent(id: string, input: unknown = {}): Promise<{ moved: number }> {
    const choice = removeAgentSchema.parse(input ?? {});
    return withLock(`agent:${id}`, async () => {
      const existing = await this.getAgent(id);
      const open = (await this.repo.listLeads()).filter((l) => l.agentId === id && isOpenLead(l));
      if (open.length > 0) {
        if (!choice.leads) {
          throw new AppError(
            `${existing.name} has ${open.length} open leads. Give them to another agent, or put them back in "Not forwarded", before removing ${existing.name}.`,
            409,
          );
        }
        if (choice.leads === "transfer") {
          if (!choice.toAgentId) throw new AppError("Choose the agent who takes the leads", 400);
          if (choice.toAgentId === id) throw new AppError("Choose a different agent to take the leads", 400);
          const target = await this.activeAgent(choice.toAgentId);
          for (const lead of open) await this.repo.saveLead({ ...lead, agentId: target.id, assignedAt: today() });
        } else {
          for (const lead of open) {
            const { assignedAt: _old, ...rest } = lead;
            await this.repo.saveLead({ ...rest, agentId: null });
          }
        }
      }
      await this.repo.saveAgent({ ...existing, active: false });
      return { moved: open.length };
    });
  }

  async addLead(input: unknown): Promise<Lead> {
    const data = leadSchema.parse(input);
    if (!(await this.projects.findById(data.projectId))) throw notFound("Project");
    if (data.agentId) await this.activeAgent(data.agentId);
    const { email, note, ...rest } = data;
    return this.repo.saveLead({
      ...rest,
      ...(email ? { email } : {}),
      ...(note ? { note } : {}),
      id: newId("l"),
      status: "new",
      createdAt: today(),
      ...(data.agentId ? { assignedAt: today() } : {}),
    });
  }

  /**
   * Adds the leads of an uploaded file in one go. Each row is checked on its own: a row with a problem (no name, an unknown
   * project, a bad phone or email) is skipped and reported, and the rest are imported. A phone that is already a lead of the
   * same project, or repeats earlier in the file, is counted as a duplicate and skipped. New leads have no agent yet.
   */
  async importLeads(input: unknown): Promise<ImportLeadsResult> {
    const data = importLeadsSchema.parse(input);
    const [projects, existing] = await Promise.all([this.projects.list(), this.repo.listLeads()]);
    const digits = canonicalPhone; // the same phone written in different ways is one lead
    const seen = new Set(existing.map((l) => `${l.projectId}|${digits(l.phone)}`));
    const counts = new Map<string, number>();
    const errors: ImportLeadsResult["errors"] = [];
    let duplicates = 0;
    let imported = 0;

    for (const [index, row] of data.leads.entries()) {
      const line = row.line ?? index + 2;
      const fail = (message: string) => errors.push({ line, message });
      const name = row.name.trim();
      const phone = row.phone.trim();
      const email = (row.email ?? "").trim().toLowerCase();
      const project = matchProject(row.project, projects);
      if (!name) { fail("The name is empty"); continue; }
      if (name.length > 120) { fail("The name is too long"); continue; }
      if (!/^[0-9+\-\s()]{7,20}$/.test(phone)) { fail(`"${phone}" is not a valid phone number`); continue; }
      if (!project) { fail(row.project.trim() ? `There is no project called "${row.project.trim()}"` : "The project is empty"); continue; }
      if (email && !z.string().email().max(254).safeParse(email).success) { fail(`"${email}" is not a valid email`); continue; }
      const key = `${project.id}|${digits(phone)}`;
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);

      await this.repo.saveLead({
        id: newId("l"),
        name,
        phone,
        projectId: project.id,
        source: matchSource(row.source) ?? data.defaultSource,
        campaignId: null,
        agentId: null,
        status: "new",
        createdAt: today(),
        ...(email ? { email } : {}),
        ...((row.note ?? "").trim() ? { note: (row.note ?? "").trim().slice(0, 500) } : {}),
      });
      imported++;
      counts.set(project.id, (counts.get(project.id) ?? 0) + 1);
    }
    return {
      imported,
      duplicates,
      errors,
      byProject: projects.filter((p) => counts.has(p.id)).map((p) => ({ projectId: p.id, projectName: p.name, count: counts.get(p.id) ?? 0 })),
    };
  }

  /** Gives every lead of a project to one agent ("all of project A to this agent"). Won and lost leads are left where they are. */
  async assignProject(input: unknown): Promise<{ assigned: number; agentName: string }> {
    const data = assignProjectSchema.parse(input);
    if (!(await this.projects.findById(data.projectId))) throw notFound("Project");
    const agent = await this.activeAgent(data.agentId);
    const activeIds = new Set((await this.repo.listAgents()).filter((a) => a.active).map((a) => a.id));
    const leads = (await this.repo.listLeads()).filter(
      (l) => l.projectId === data.projectId && l.agentId !== agent.id && (data.includeAssigned ? isOpenLead(l) : isUnforwarded(l, activeIds)),
    );
    if (leads.length === 0) throw new AppError("This project has no leads to give", 409);
    for (const lead of leads) await this.repo.saveLead({ ...lead, agentId: agent.id, assignedAt: today() });
    return { assigned: leads.length, agentName: agent.name };
  }

  private async activeAgent(id: string): Promise<Agent> {
    const agent = await this.getAgent(id);
    if (!agent.active) throw new AppError(`${agent.name} is no longer an active agent`, 409);
    return agent;
  }

  /**
   * An agent starts a call or a WhatsApp message to a lead's client: it is counted, and a brand new lead becomes "contacted".
   * `onlyAgentId` limits it to that agent's own leads (an agent cannot contact someone else's lead).
   */
  async logContact(input: unknown, onlyAgentId?: string): Promise<LeadContact> {
    const data = logContactSchema.parse(input);
    const lead = (await this.repo.listLeads()).find((l) => l.id === data.leadId);
    if (!lead || (onlyAgentId && lead.agentId !== onlyAgentId)) throw notFound("Lead");
    if (!lead.agentId) throw new AppError("Forward this lead to an agent before contacting the client", 409);
    const contact = await this.repo.saveLeadContact({
      id: newId("ct"),
      leadId: lead.id,
      agentId: lead.agentId,
      channel: data.channel,
      at: new Date().toISOString(),
    });
    if (lead.status === "new") await this.repo.setLeadStatus(lead.id, "contacted");
    // Contacting the client again counts as following up on any earlier promise to do so.
    for (const earlier of await this.repo.listLeadContacts()) {
      if (earlier.leadId === lead.id && earlier.id !== contact.id && earlier.followUpAt && !earlier.followUpDone) {
        await this.repo.saveLeadContact({ ...earlier, followUpDone: true });
      }
    }
    return contact;
  }

  private async ownContact(contactId: string, onlyAgentId?: string): Promise<LeadContact> {
    const contact = (await this.repo.listLeadContacts()).find((c) => c.id === contactId);
    if (!contact || (onlyAgentId && contact.agentId !== onlyAgentId)) throw notFound("Contact");
    return contact;
  }

  /**
   * The agent writes what was said on a call or message, and, if the client asked to be contacted again, when.
   * The follow-up time must be in the future. Saving again replaces the earlier note.
   */
  async saveContactNote(input: unknown, onlyAgentId?: string): Promise<LeadContact> {
    const data = contactNoteSchema.parse(input);
    const contact = await this.ownContact(data.contactId, onlyAgentId);
    const { followUpAt: _at, followUpDone: _done, comment: _comment, ...rest } = contact;
    const when = data.followUpAt || undefined;
    if (when && new Date(when).getTime() <= Date.now()) throw new AppError("Choose a follow-up time that is still to come", 400);
    return this.repo.saveLeadContact({
      ...rest,
      ...(data.comment ? { comment: data.comment } : {}),
      ...(when ? { followUpAt: when, followUpDone: false } : {}),
    });
  }

  /** The agent says a follow-up is finished (or no longer needed), so it stops showing as due. */
  async completeFollowUp(contactId: string, onlyAgentId?: string): Promise<LeadContact> {
    const contact = await this.ownContact(contactId, onlyAgentId);
    if (!contact.followUpAt) throw new AppError("This contact has no follow-up", 409);
    return this.repo.saveLeadContact({ ...contact, followUpDone: true });
  }

  /** An agent's open follow-ups, the nearest first. The ones whose time has come (or passed) are first of all. */
  async followUps(agentId: string): Promise<FollowUp[]> {
    const [contacts, leads] = await Promise.all([this.repo.listLeadContacts(), this.repo.listLeads()]);
    const byLead = new Map(leads.map((l) => [l.id, l]));
    return contacts
      .filter((c) => c.agentId === agentId && c.followUpAt && !c.followUpDone && byLead.get(c.leadId)?.status !== "won")
      .map((c): FollowUp => {
        const lead = byLead.get(c.leadId)!;
        return {
          contactId: c.id,
          leadId: lead.id,
          leadName: lead.name,
          leadPhone: lead.phone,
          projectId: lead.projectId,
          at: c.followUpAt as string,
          comment: c.comment ?? "",
          channel: c.channel,
        };
      })
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  /** Calls and WhatsApp messages per lead, with the time of the last one. */
  async contactSummary(): Promise<Map<string, LeadContactSummary>> {
    const summary = new Map<string, LeadContactSummary>();
    for (const contact of await this.repo.listLeadContacts()) {
      const entry = summary.get(contact.leadId) ?? { calls: 0, whatsapp: 0 };
      if (contact.channel === "call") entry.calls += 1;
      else entry.whatsapp += 1;
      if (!entry.lastAt || contact.at > entry.lastAt) {
        entry.lastAt = contact.at;
        if (contact.comment) entry.lastComment = contact.comment;
      }
      if (contact.followUpAt && !contact.followUpDone && (!entry.nextFollowUpAt || contact.followUpAt < entry.nextFollowUpAt)) {
        entry.nextFollowUpAt = contact.followUpAt;
      }
      summary.set(contact.leadId, entry);
    }
    return summary;
  }

  /** The sales manager forwards one lead to an agent (or takes it back with `agentId: null`). The agent sees it in their portal. */
  async assignLead(input: unknown): Promise<Lead> {
    const data = assignLeadSchema.parse(input);
    const lead = (await this.repo.listLeads()).find((l) => l.id === data.leadId);
    if (!lead) throw notFound("Lead");
    if (data.agentId) await this.activeAgent(data.agentId);
    const { assignedAt: _old, ...rest } = lead;
    return this.repo.saveLead({ ...rest, agentId: data.agentId, ...(data.agentId ? { assignedAt: today() } : {}) });
  }

  /**
   * Shares leads among agents one after the other so everyone gets the same number (or one more or less).
   * By default: every unassigned lead, among every active agent.
   */
  async assignEqually(input: unknown): Promise<{ assigned: number; perAgent: { agentId: string; agentName: string; count: number }[] }> {
    const data = assignEquallySchema.parse(input);
    const [leads, allAgents] = await Promise.all([this.repo.listLeads(), this.repo.listAgents()]);
    const agents = allAgents
      .filter((a) => a.active && (!data.agentIds || data.agentIds.includes(a.id)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (agents.length === 0) throw new AppError("There is no active agent to give leads to", 409);
    const activeIds = new Set(allAgents.filter((a) => a.active).map((a) => a.id));
    const toShare = leads
      .filter((l) => (data.leadIds ? data.leadIds.includes(l.id) : isUnforwarded(l, activeIds)) && (!data.projectId || l.projectId === data.projectId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (toShare.length === 0) throw new AppError("There are no leads to share", 409);

    const counts = new Map(agents.map((a) => [a.id, 0]));
    for (const [index, lead] of toShare.entries()) {
      const agent = agents[index % agents.length];
      counts.set(agent.id, (counts.get(agent.id) ?? 0) + 1);
      await this.repo.saveLead({ ...lead, agentId: agent.id, assignedAt: today() });
    }
    return {
      assigned: toShare.length,
      perAgent: agents.map((a) => ({ agentId: a.id, agentName: a.name, count: counts.get(a.id) ?? 0 })),
    };
  }

  async setLeadStatus(id: string, status: unknown): Promise<Lead> {
    const updated = await this.repo.setLeadStatus(id, leadStatusSchema.parse(status));
    if (!updated) throw notFound("Lead");
    return updated;
  }

  /** Records an agent's sale and marks the originating lead as won. */
  /** Sales in one project are made one at a time, so the same unit can never be sold (and credited) twice by two requests arriving together. */
  private sellingLock<T>(input: unknown, work: () => Promise<T>): Promise<T> {
    const projectId = (input as { projectId?: unknown } | null)?.projectId;
    return typeof projectId === "string" ? withLock(`sale:${projectId}`, work) : work();
  }

  async recordSale(input: unknown): Promise<Sale> {
    return this.sellingLock(input, () => this.recordSaleNow(input));
  }

  private async recordSaleNow(input: unknown): Promise<Sale> {
    const data = saleSchema.parse(input);
    if (data.agentId) {
      const agent = (await this.repo.listAgents()).find((a) => a.id === data.agentId);
      if (!agent) throw notFound("Agent");
      if (!agent.active) throw new AppError(`${agent.name} is no longer an active agent`, 409);
    }
    if (data.managerId) {
      const manager = (await this.repo.listSalesManagers()).find((m) => m.id === data.managerId);
      if (!manager) throw notFound("Sales manager");
      if (!manager.active) throw new AppError(`${manager.name} is inactive`, 409);
    }
    return this.sell(data, data.agentId ?? null, data.leadId, data.managerId ?? null);
  }

  /** A direct sale: the Super Admin, or a sales manager (`managerId`), sells a unit straight to a buyer, with a discount if they give one. */
  async recordDirectSale(input: unknown): Promise<Sale> {
    return this.sellingLock(input, () => this.recordDirectSaleNow(input));
  }

  private async recordDirectSaleNow(input: unknown): Promise<Sale> {
    const data = directSaleSchema.parse(input);
    if (data.managerId) {
      const manager = (await this.repo.listSalesManagers()).find((m) => m.id === data.managerId);
      if (!manager) throw notFound("Sales manager");
      if (!manager.active) throw new AppError(`${manager.name} is inactive`, 409);
    }
    return this.sell(data, null, null, data.managerId ?? null);
  }

  /**
   * An agent sells a unit. It works like a direct sale (all the buyer's details, a discount if given) and, when it is for one
   * of their leads, that lead becomes "won". `onlyAgentId` limits it to that agent (an agent cannot sell as someone else).
   */
  async recordAgentSale(input: unknown, onlyAgentId?: string): Promise<Sale> {
    return this.sellingLock(input, () => this.recordAgentSaleNow(input, onlyAgentId));
  }

  private async recordAgentSaleNow(input: unknown, onlyAgentId?: string): Promise<Sale> {
    const data = agentSaleSchema.parse(input);
    if (onlyAgentId && data.agentId !== onlyAgentId) throw new AppError("You can only sell your own leads", 403);
    const agent = await this.activeAgent(data.agentId);
    // The sale may be tied to one of the agent's leads (which then becomes "won"), or be a client who is not in the list.
    const lead = data.leadId ? (await this.repo.listLeads()).find((l) => l.id === data.leadId) : undefined;
    if (data.leadId) {
      if (!lead) throw notFound("Lead");
      if (lead.agentId !== agent.id) throw new AppError("This lead is not forwarded to this agent", 409);
      if (lead.status === "won") throw new AppError("This lead is already sold", 409);
    }
    return this.sell(data, agent.id, lead?.id ?? null, null);
  }

  /**
   * What each agent did in a period (or ever, without one): leads forwarded, calls and WhatsApp messages, units sold, what the
   * buyers paid and the commission. Sales by the sales manager himself and direct sales are listed too, so the rows add up
   * to everything that was sold.
   */
  async agentReport(range?: { from: string; to: string }): Promise<AgentReportRow[]> {
    const [agents, managers, leads, sales, contacts] = await Promise.all([
      this.repo.listAgents(),
      this.repo.listSalesManagers(),
      this.repo.listLeads(),
      this.repo.listSales(),
      this.repo.listLeadContacts(),
    ]);
    const within = (date: string) => !range || (date >= range.from && date <= range.to);
    const periodSales = sales.filter((s) => within(s.date));

    const rows: AgentReportRow[] = agents
      .map((agent): AgentReportRow => {
        const own = periodSales.filter((s) => s.agentId === agent.id);
        const revenue = own.reduce((sum, s) => sum + s.price, 0);
        const mine = contacts.filter((c) => c.agentId === agent.id && within(c.at.slice(0, 10)));
        return {
          key: agent.id,
          kind: "agent",
          name: agent.name,
          leads: leads.filter((l) => l.agentId === agent.id && within(l.assignedAt ?? l.createdAt)).length,
          calls: mine.filter((c) => c.channel === "call").length,
          whatsapp: mine.filter((c) => c.channel === "whatsapp").length,
          units: own.length,
          revenue,
          commission: commissionFor(revenue, agent.commissionRate),
        };
      })
      // An agent who was removed stays in a report only while they have something in it.
      .filter((row) => agents.find((a) => a.id === row.key)?.active || row.units + row.leads + row.calls + row.whatsapp > 0);

    for (const manager of managers) {
      const own = periodSales.filter((s) => s.soldByManagerId === manager.id);
      if (manager.active || own.length) {
        rows.push({ key: manager.id, kind: "manager", name: `${manager.name} (sales manager)`, leads: 0, calls: 0, whatsapp: 0, units: own.length, revenue: own.reduce((sum, s) => sum + s.price, 0), commission: 0 });
      }
    }
    const direct = periodSales.filter((s) => !s.agentId && !s.soldByManagerId);
    if (direct.length) {
      rows.push({ key: "direct", kind: "direct", name: "Direct sales (Super Admin)", leads: 0, calls: 0, whatsapp: 0, units: direct.length, revenue: direct.reduce((sum, s) => sum + s.price, 0), commission: 0 });
    }
    return rows;
  }

  /** The report of one month, worked out from the sales, calls and leads of that month. */
  async monthlyReport(period: string): Promise<AgentReportRow[]> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new AppError("The month must look like 2026-10", 400);
    return this.agentReport({ from: `${period}-01`, to: `${period}-31` });
  }

  /** One agent's month in detail: the summary, the sales they made, and the leads forwarded to them. */
  async agentMonthDetail(
    agentId: string,
    period: string,
  ): Promise<{
    agent: Agent;
    period: string;
    row: AgentReportRow;
    sales: (Sale & { commission: number })[];
    leads: (Lead & { contacts: { calls: number; whatsapp: number } })[];
  }> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new AppError("The month must look like 2026-10", 400);
    const agent = await this.getAgent(agentId);
    const range = { from: `${period}-01`, to: `${period}-31` };
    const [rows, sales, leads, contacts] = await Promise.all([
      this.agentReport(range),
      this.repo.listSales(),
      this.repo.listLeads(),
      this.repo.listLeadContacts(),
    ]);
    const inMonth = (date: string) => date >= range.from && date <= range.to;
    return {
      agent,
      period,
      row:
        rows.find((r) => r.key === agent.id) ??
        { key: agent.id, kind: "agent", name: agent.name, leads: 0, calls: 0, whatsapp: 0, units: 0, revenue: 0, commission: 0 },
      sales: sales
        .filter((s) => s.agentId === agent.id && inMonth(s.date))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => ({ ...s, commission: commissionFor(s.price, agent.commissionRate) })),
      leads: leads
        .filter((l) => l.agentId === agent.id && inMonth(l.assignedAt ?? l.createdAt))
        .map((lead) => {
          const mine = contacts.filter((c) => c.leadId === lead.id && inMonth(c.at.slice(0, 10)));
          return { ...lead, contacts: { calls: mine.filter((c) => c.channel === "call").length, whatsapp: mine.filter((c) => c.channel === "whatsapp").length } };
        }),
    };
  }

  /**
   * Saves a month's report. The current month can be saved "so far" at any time; a month that has ended is saved as final.
   * Saving again replaces the earlier save of the same month.
   */
  async saveMonthlyReport(period: string): Promise<MonthlyReportSnapshot> {
    const rows = await this.monthlyReport(period);
    return this.repo.saveMonthlyReport({ period, final: period < today().slice(0, 7), generatedAt: new Date().toISOString(), rows });
  }

  /**
   * Makes sure every month that is over has its report saved (from the first month that has any activity), and returns all
   * saved reports, newest first. Months already saved as final are left exactly as they were saved.
   */
  async savedMonthlyReports(): Promise<MonthlyReportSnapshot[]> {
    const [sales, leads, contacts, saved] = await Promise.all([
      this.repo.listSales(),
      this.repo.listLeads(),
      this.repo.listLeadContacts(),
      this.repo.listMonthlyReports(),
    ]);
    const dates = [...sales.map((s) => s.date), ...leads.map((l) => l.assignedAt ?? l.createdAt), ...contacts.map((c) => c.at.slice(0, 10))];
    const current = today().slice(0, 7);
    if (dates.length) {
      const first = dates.sort()[0].slice(0, 7);
      for (let period = first; period < current; period = addMonths(`${period}-01`, 1).slice(0, 7)) {
        if (!saved.some((r) => r.period === period && r.final)) await this.saveMonthlyReport(period);
      }
    }
    return this.repo.listMonthlyReports();
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
      allUnits: p.units.map((u) => ({ ...u, sold: !(free.get(p.id) ?? []).some((f) => f.unit === u.unit) })),
    }));
  }

  /**
   * Every sale, whoever makes it: takes one unit out of the project's available units and credits the
   * price to the project's accounts. The price always comes from the project's rate for the chosen plot
   * category (and the size of the unit), never from the browser.
   */
  private async sell(
    data: z.output<typeof saleSchema> | z.output<typeof directSaleSchema> | z.output<typeof agentSaleSchema>,
    agentId: string | null,
    leadId: string | null,
    managerId: string | null,
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

    // On instalments, the buyer pays the down payment now; the rest follows the plan.
    const planInput = "paymentPlan" in data ? data.paymentPlan : undefined;
    const plan = planInput ? buildPlan(priced.price, planInput, today()) : null;
    if (plan && "problem" in plan) throw new AppError(plan.problem, 400);
    if (plan && !this.finance) throw new AppError("Instalment plans are not available", 409);

    if (leadId && !(await this.repo.setLeadStatus(leadId, "won"))) throw new AppError("Lead not found", 404);

    const sale = await this.repo.saveSale({
      id: newId("sl"),
      projectId: project.id,
      agentId,
      ...(managerId ? { soldByManagerId: managerId } : {}),
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
      ...(plan ? { paymentType: "installment" as const, status: "booked" as const } : {}),
      date: today(),
    });
    await this.accounts.add({
      id: newId("ac"),
      projectId: project.id,
      date: sale.date,
      type: "sale",
      amount: plan ? plan.down : priced.price,
      description: `${plan ? "Down payment for the sale" : "Sale"} of ${highRise ? `unit ${unitName}, floor ${floor}` : `plot ${unitName}`} (${data.category})${
        priced.discountAmount > 0 ? `, ${priced.discountAmount} discount` : ""
      }`,
      party: data.buyer,
    });
    if (plan && this.finance) {
      const items: Installment[] = plan.items.map((item, index) => ({
        id: newId("in"),
        saleId: sale.id,
        projectId: project.id,
        seq: index + 1,
        kind: item.kind,
        amount: item.amount,
        dueDate: item.dueDate,
        paid: item.kind === "booking" ? item.amount : 0,
        ...(item.kind === "booking" ? { paidAt: sale.date, payments: [{ date: sale.date, amount: item.amount }] } : {}),
        contacts: [],
      }));
      await this.finance.saveAll(items);
    }
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
