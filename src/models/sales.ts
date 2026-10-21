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

export interface Agent {
  id: string;
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
  agentId: string | null;
  status: LeadStatus;
  createdAt: string;
}

export interface Sale {
  id: string;
  projectId: string;
  agentId: string | null; // null for a direct sale made by the Super Admin
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
  price: number; // what the buyer pays; this is what the project is credited
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
