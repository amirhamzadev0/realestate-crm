import "server-only";

import type { Agent, AgentReportRow, Campaign, Lead, LeadContact, LeadStatus, MonthlyReportSnapshot, Sale, SalesManager } from "@/models/sales";
import type { SalesRepository } from "@/repositories/contracts";
import { run, select, selectOne, type Row } from "./db";

const AGENT_COLUMNS = "id, manager_id AS managerId, name, phone, commission_rate AS commissionRate, active";
const CAMPAIGN_COLUMNS = "id, name, platform, project_id AS projectId, budget, start_date AS startDate, active";
const LEAD_COLUMNS = `id, name, phone, project_id AS projectId, source, campaign_id AS campaignId,
  agent_id AS agentId, status, created_at AS createdAt, email, note, assigned_at AS assignedAt`;
const SALE_COLUMNS =
  "id, project_id AS projectId, agent_id AS agentId, sold_by_manager_id AS soldByManagerId, lead_id AS leadId, unit, category, buyer, buyer_phone AS buyerPhone, buyer_cnic AS buyerCnic, buyer_email AS buyerEmail, floor, area, rate, list_price AS listPrice, discount_mode AS discountMode, discount_value AS discountValue, discount_amount AS discountAmount, price, sale_date AS date";

const decodeAgent = (row: Row) => ({ ...(row as unknown as Agent), active: Boolean(row.active) });
const decodeCampaign = (row: Row) => ({ ...(row as unknown as Campaign), active: Boolean(row.active) });
/** NULL email, note and assigned_at are left out, matching the mock data where the keys are simply absent. */
function decodeLead(row: Row): Lead {
  const { email, note, assignedAt, ...rest } = row as unknown as Lead;
  return { ...rest, ...(email != null ? { email } : {}), ...(note != null ? { note } : {}), ...(assignedAt != null ? { assignedAt } : {}) };
}
/** A NULL floor is left out, matching the mock data where the key is simply absent. */
function decodeSale(row: Row): Sale {
  const { floor, buyer, buyerPhone, buyerCnic, buyerEmail, discountMode, discountValue, discountAmount, ...rest } = row as unknown as Sale;
  return {
    ...rest,
    ...(floor != null ? { floor } : {}),
    ...(buyer != null ? { buyer } : {}),
    ...(buyerPhone != null ? { buyerPhone } : {}),
    ...(buyerCnic != null ? { buyerCnic } : {}),
    ...(buyerEmail != null ? { buyerEmail } : {}),
    ...(discountMode != null ? { discountMode, discountValue, discountAmount } : {}),
  };
}

const decodeManager = (row: Row) => ({ ...(row as unknown as SalesManager), active: Boolean(row.active) });

export class MysqlSalesRepository implements SalesRepository {
  async listSalesManagers() {
    return (await select("SELECT id, name, phone, email, active FROM sales_managers ORDER BY name")).map(decodeManager);
  }
  async saveSalesManager(manager: SalesManager) {
    await run(
      `INSERT INTO sales_managers (id, name, phone, email, active) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), email = VALUES(email), active = VALUES(active)`,
      [manager.id, manager.name, manager.phone, manager.email, manager.active ? 1 : 0],
    );
    return manager;
  }
  async listMonthlyReports() {
    const rows = await select("SELECT period, is_final AS isFinal, generated_at AS generatedAt, payload FROM sales_reports ORDER BY period DESC");
    return rows.map((row): MonthlyReportSnapshot => ({
      period: String(row.period),
      final: Boolean(row.isFinal),
      generatedAt: `${String(row.generatedAt).replace(" ", "T")}Z`,
      // mysql2 parses JSON columns, but a driver that returns text must not break reads.
      rows: (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as AgentReportRow[],
    }));
  }
  async saveMonthlyReport(report: MonthlyReportSnapshot) {
    await run(
      `INSERT INTO sales_reports (period, is_final, generated_at, payload) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_final = VALUES(is_final), generated_at = VALUES(generated_at), payload = VALUES(payload)`,
      [report.period, report.final ? 1 : 0, report.generatedAt.replace("T", " ").replace("Z", ""), JSON.stringify(report.rows)],
    );
    return report;
  }
  async listLeadContacts() {
    const rows = await select(
      `SELECT id, lead_id AS leadId, agent_id AS agentId, channel, contacted_at AS \`at\`, comment, follow_up_at AS followUpAt,
         follow_up_done AS followUpDone FROM lead_contacts ORDER BY contacted_at`,
    );
    // MySQL hands back "YYYY-MM-DD HH:MM:SS.mmm" (UTC); the app uses ISO text. NULL notes and follow-ups are left out.
    const iso = (value: unknown) => `${String(value).replace(" ", "T")}Z`;
    return rows.map((row): LeadContact => ({
      id: String(row.id),
      leadId: String(row.leadId),
      agentId: String(row.agentId),
      channel: row.channel,
      at: iso(row.at),
      ...(row.comment != null ? { comment: String(row.comment) } : {}),
      ...(row.followUpAt != null ? { followUpAt: iso(row.followUpAt) } : {}),
      ...(row.followUpAt != null ? { followUpDone: Boolean(row.followUpDone) } : {}),
    }));
  }
  async saveLeadContact(contact: LeadContact) {
    const sqlTime = (iso: string) => iso.replace("T", " ").replace("Z", "");
    await run(
      `INSERT INTO lead_contacts (id, lead_id, agent_id, channel, contacted_at, comment, follow_up_at, follow_up_done)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE comment = VALUES(comment), follow_up_at = VALUES(follow_up_at), follow_up_done = VALUES(follow_up_done)`,
      [
        contact.id,
        contact.leadId,
        contact.agentId,
        contact.channel,
        sqlTime(contact.at),
        contact.comment ?? null,
        contact.followUpAt ? sqlTime(contact.followUpAt) : null,
        contact.followUpDone ? 1 : 0,
      ],
    );
    return contact;
  }
  async listAgents() {
    return (await select(`SELECT ${AGENT_COLUMNS} FROM agents ORDER BY name`)).map(decodeAgent);
  }
  async saveAgent(agent: Agent) {
    await run(
      `INSERT INTO agents (id, manager_id, name, phone, commission_rate, active) VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE manager_id = VALUES(manager_id), name = VALUES(name), phone = VALUES(phone),
         commission_rate = VALUES(commission_rate), active = VALUES(active)`,
      [agent.id, agent.managerId, agent.name, agent.phone, agent.commissionRate, agent.active ? 1 : 0],
    );
    return agent;
  }
  async listCampaigns() {
    return (await select(`SELECT ${CAMPAIGN_COLUMNS} FROM campaigns ORDER BY start_date, name`)).map(decodeCampaign);
  }
  async listLeads() {
    return (await select(`SELECT ${LEAD_COLUMNS} FROM leads ORDER BY created_at DESC, inserted_at DESC`)).map(decodeLead);
  }
  async saveLead(lead: Lead) {
    await run(
      `INSERT INTO leads (id, name, phone, project_id, source, campaign_id, agent_id, status, created_at, email, note, assigned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), source = VALUES(source),
         campaign_id = VALUES(campaign_id), agent_id = VALUES(agent_id), status = VALUES(status),
         email = VALUES(email), note = VALUES(note), assigned_at = VALUES(assigned_at)`,
      [lead.id, lead.name, lead.phone, lead.projectId, lead.source, lead.campaignId, lead.agentId, lead.status, lead.createdAt, lead.email ?? null, lead.note ?? null, lead.assignedAt ?? null],
    );
    return lead;
  }
  async setLeadStatus(id: string, status: LeadStatus) {
    await run("UPDATE leads SET status = ? WHERE id = ?", [status, id]);
    const row = await selectOne(`SELECT ${LEAD_COLUMNS} FROM leads WHERE id = ?`, [id]);
    return row ? decodeLead(row) : null;
  }
  async listSales() {
    return (await select(`SELECT ${SALE_COLUMNS} FROM sales ORDER BY sale_date DESC, inserted_at DESC`)).map(decodeSale);
  }
  async saveSale(sale: Sale) {
    await run(
      `INSERT INTO sales (id, project_id, agent_id, sold_by_manager_id, lead_id, unit, category, buyer, buyer_phone, buyer_cnic, buyer_email, floor, area, rate, list_price, discount_mode, discount_value, discount_amount, price, sale_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE unit = VALUES(unit), category = VALUES(category), buyer = VALUES(buyer), buyer_phone = VALUES(buyer_phone), buyer_cnic = VALUES(buyer_cnic), buyer_email = VALUES(buyer_email), floor = VALUES(floor), area = VALUES(area), rate = VALUES(rate), list_price = VALUES(list_price),
         discount_mode = VALUES(discount_mode), discount_value = VALUES(discount_value), discount_amount = VALUES(discount_amount),
         price = VALUES(price), sale_date = VALUES(sale_date)`,
      [sale.id, sale.projectId, sale.agentId, sale.soldByManagerId ?? null, sale.leadId, sale.unit, sale.category, sale.buyer ?? null, sale.buyerPhone ?? null, sale.buyerCnic ?? null, sale.buyerEmail ?? null, sale.floor ?? null, sale.area, sale.rate, sale.listPrice, sale.discountMode ?? null, sale.discountValue ?? null, sale.discountAmount ?? null, sale.price, sale.date],
    );
    return sale;
  }
}
