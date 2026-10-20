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
  agentId: string;
  leadId: string | null;
  unit: string; // plot / flat number
  price: number;
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
