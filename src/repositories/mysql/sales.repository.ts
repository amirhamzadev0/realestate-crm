import "server-only";

import type { Agent, Campaign, Lead, LeadStatus, Sale } from "@/models/sales";
import type { SalesRepository } from "@/repositories/contracts";
import { run, select, selectOne, type Row } from "./db";

const AGENT_COLUMNS = "id, name, phone, commission_rate AS commissionRate, active";
const CAMPAIGN_COLUMNS = "id, name, platform, project_id AS projectId, budget, start_date AS startDate, active";
const LEAD_COLUMNS = `id, name, phone, project_id AS projectId, source, campaign_id AS campaignId,
  agent_id AS agentId, status, created_at AS createdAt`;
const SALE_COLUMNS =
  "id, project_id AS projectId, agent_id AS agentId, lead_id AS leadId, unit, category, buyer, buyer_phone AS buyerPhone, buyer_cnic AS buyerCnic, buyer_email AS buyerEmail, floor, area, rate, list_price AS listPrice, discount_mode AS discountMode, discount_value AS discountValue, discount_amount AS discountAmount, price, sale_date AS date";

const decodeAgent = (row: Row) => ({ ...(row as unknown as Agent), active: Boolean(row.active) });
const decodeCampaign = (row: Row) => ({ ...(row as unknown as Campaign), active: Boolean(row.active) });
const decodeLead = (row: Row) => row as unknown as Lead;
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

export class MysqlSalesRepository implements SalesRepository {
  async listAgents() {
    return (await select(`SELECT ${AGENT_COLUMNS} FROM agents ORDER BY name`)).map(decodeAgent);
  }
  async saveAgent(agent: Agent) {
    await run(
      `INSERT INTO agents (id, name, phone, commission_rate, active) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone),
         commission_rate = VALUES(commission_rate), active = VALUES(active)`,
      [agent.id, agent.name, agent.phone, agent.commissionRate, agent.active ? 1 : 0],
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
      `INSERT INTO leads (id, name, phone, project_id, source, campaign_id, agent_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), source = VALUES(source),
         campaign_id = VALUES(campaign_id), agent_id = VALUES(agent_id), status = VALUES(status)`,
      [lead.id, lead.name, lead.phone, lead.projectId, lead.source, lead.campaignId, lead.agentId, lead.status, lead.createdAt],
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
      `INSERT INTO sales (id, project_id, agent_id, lead_id, unit, category, buyer, buyer_phone, buyer_cnic, buyer_email, floor, area, rate, list_price, discount_mode, discount_value, discount_amount, price, sale_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE unit = VALUES(unit), category = VALUES(category), buyer = VALUES(buyer), buyer_phone = VALUES(buyer_phone), buyer_cnic = VALUES(buyer_cnic), buyer_email = VALUES(buyer_email), floor = VALUES(floor), area = VALUES(area), rate = VALUES(rate), list_price = VALUES(list_price),
         discount_mode = VALUES(discount_mode), discount_value = VALUES(discount_value), discount_amount = VALUES(discount_amount),
         price = VALUES(price), sale_date = VALUES(sale_date)`,
      [sale.id, sale.projectId, sale.agentId, sale.leadId, sale.unit, sale.category, sale.buyer ?? null, sale.buyerPhone ?? null, sale.buyerCnic ?? null, sale.buyerEmail ?? null, sale.floor ?? null, sale.area, sale.rate, sale.listPrice, sale.discountMode ?? null, sale.discountValue ?? null, sale.discountAmount ?? null, sale.price, sale.date],
    );
    return sale;
  }
}
