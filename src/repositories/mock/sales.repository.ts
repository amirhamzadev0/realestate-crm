import type { Agent, Lead, LeadContact, LeadStatus, MonthlyReportSnapshot, Sale, SalesManager } from "@/models/sales";
import type { SalesRepository } from "@/repositories/contracts";
import { getStore, upsert } from "./store";

export class MockSalesRepository implements SalesRepository {
  async listSalesManagers() {
    return structuredClone([...getStore().salesManagers].sort((a, b) => a.name.localeCompare(b.name)));
  }
  async saveSalesManager(manager: SalesManager) {
    return upsert(getStore().salesManagers, manager);
  }
  async listAgents() {
    return structuredClone(getStore().agents);
  }
  async saveAgent(agent: Agent) {
    return upsert(getStore().agents, agent);
  }
  async listCampaigns() {
    return structuredClone(getStore().campaigns);
  }
  async listMonthlyReports() {
    return structuredClone([...getStore().monthlyReports].sort((a, b) => b.period.localeCompare(a.period)));
  }
  async saveMonthlyReport(report: MonthlyReportSnapshot) {
    const reports = getStore().monthlyReports;
    const index = reports.findIndex((r) => r.period === report.period);
    if (index === -1) reports.push(structuredClone(report));
    else reports[index] = structuredClone(report);
    return structuredClone(report);
  }
  async listLeadContacts() {
    return structuredClone(getStore().leadContacts);
  }
  async saveLeadContact(contact: LeadContact) {
    return upsert(getStore().leadContacts, contact);
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
