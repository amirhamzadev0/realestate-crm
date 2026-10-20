import type { Agent, Lead, LeadStatus, Sale } from "@/models/sales";
import type { SalesRepository } from "@/repositories/contracts";
import { getStore, upsert } from "./store";

export class MockSalesRepository implements SalesRepository {
  async listAgents() {
    return structuredClone(getStore().agents);
  }
  async saveAgent(agent: Agent) {
    return upsert(getStore().agents, agent);
  }
  async listCampaigns() {
    return structuredClone(getStore().campaigns);
  }
  async listLeads() {
    return structuredClone([...getStore().leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  async saveLead(lead: Lead) {
    return upsert(getStore().leads, lead);
  }
  async setLeadStatus(id: string, status: LeadStatus) {
    const found = getStore().leads.find((l) => l.id === id);
    if (!found) return null;
    found.status = status;
    return structuredClone(found);
  }
  async listSales() {
    return structuredClone(getStore().sales);
  }
  async saveSale(sale: Sale) {
    return upsert(getStore().sales, sale);
  }
}
