import type { PlotCategory } from "@/models/project";
import type { DiscountMode } from "@/utils/pricing";

export type LeadSource = "facebook" | "instagram" | "walk-in" | "referral" | "website";
export type LeadStatus = "new" | "contacted" | "site-visit" | "negotiation" | "won" | "lost";

export interface Campaign {
  id: string;
  name: string;
  platform: "facebook" | "instagram";
  projectId: string;
  budget: number;
  startDate: string;
  active: boolean;
}

/** Runs the sales department: creates agents, and can record sales too. */
export interface SalesManager {
  id: string;
  name: string;
  phone: string;
  email: string;
  active: boolean;
}

export interface Agent {
  id: string;
  managerId: string | null; // the sales manager who created this agent
  name: string;
  phone: string;
  commissionRate: number; // percent of sale price
  active: boolean;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  projectId: string;
  source: LeadSource;
  campaignId: string | null;
  agentId: string | null; // the agent the lead was forwarded to
  status: LeadStatus;
  createdAt: string;
  email?: string;
  note?: string;
  assignedAt?: string; // the day the lead was forwarded to the agent
}

export type ContactChannel = "call" | "whatsapp";

/** One time an agent called or messaged a lead's client. */
export interface LeadContact {
  id: string;
  leadId: string;
  agentId: string;
  channel: ContactChannel;
  at: string; // ISO date and time (UTC)
  comment?: string; // what was discussed
  followUpAt?: string; // ISO date and time (UTC): when the client asked to be contacted again
  followUpDone?: boolean; // the agent followed up (or marked it done)
}

/** How often, and when last, a lead's client was contacted. */
export interface LeadContactSummary {
  calls: number;
  whatsapp: number;
  lastAt?: string;
  lastComment?: string; // the note of the latest contact that has one
  nextFollowUpAt?: string; // the nearest follow-up that is still open
}

/** A follow-up the agent has to do: the lead, and what was said last time. */
export interface FollowUp {
  contactId: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  projectId: string;
  at: string; // ISO date and time (UTC) the follow-up is due
  comment: string;
  channel: ContactChannel;
}

/** One line of a sales report: an agent, the sales manager selling himself, or the Super Admin's direct sales. */
export interface AgentReportRow {
  key: string; // agent id, manager id, or "direct"
  kind: "agent" | "manager" | "direct";
  name: string;
  leads: number; // leads forwarded to the agent in the period
  calls: number;
  whatsapp: number;
  units: number; // units sold
  revenue: number; // what the buyers paid
  commission: number; // owed to the agent on those sales
}

/** A monthly report as it was saved. A month that is not over yet is saved as "so far" (`final: false`) until it ends. */
export interface MonthlyReportSnapshot {
  period: string; // "2026-10"
  final: boolean;
  generatedAt: string; // ISO date and time
  rows: AgentReportRow[];
}

export interface Sale {
  id: string;
  projectId: string;
  agentId: string | null; // the agent who sold it; null when a sales manager or the Super Admin sold it
  soldByManagerId?: string | null; // set when a sales manager sold it himself (no commission)
  leadId: string | null;
  buyer?: string; // buyer details are required for direct sales
  buyerPhone?: string;
  buyerCnic?: string;
  buyerEmail?: string;
  category: PlotCategory;
  unit: string; // plot / flat number
  floor?: string; // high-rise only
  area: number; // sq ft (high-rise) or marla (land plotting)
  rate: number; // the project's list rate when the sale was made
  listPrice: number; // area x rate
  discountMode?: Exclude<DiscountMode, "none">; // set when the Super Admin gave a discount
  discountValue?: number; // the amount, the discounted rate or the percentage, as entered
  discountAmount?: number; // listPrice - price
  price: number; // what the buyer pays in all; credited to the project at once for cash, and as the instalments come in otherwise
  paymentType?: "cash" | "installment"; // missing means cash
  status?: "booked" | "sold"; // booked: sold on instalments that are not all paid yet; missing means sold
  date: string;
}

export interface AgentPerformance {
  agentId: string;
  agentName: string;
  sales: number; // count
  revenue: number;
  commission: number;
  leads: number;
}

export interface CampaignPerformance {
  campaignId: string;
  name: string;
  leads: number;
  won: number;
  budget: number;
  costPerLead: number;
}

export interface SalesReport {
  totalRevenue: number;
  totalCommission: number;
  totalSales: number;
  totalLeads: number;
  conversionRate: number; // percent
  agents: AgentPerformance[];
  campaigns: CampaignPerformance[];
}
