import json
def sub(p,a,b,count=1):
    s=open(p,encoding='utf8').read()
    assert a in s,(p,a[:70])
    open(p,'w',encoding='utf8').write(s.replace(a,b,count))
def write(p,t):
    open(p,'w',encoding='utf8').write(t)

# ---- models
sub('src/models/sales.ts','export interface Sale {','''/** One line of a sales report: an agent, the sales manager selling himself, or the Super Admin's direct sales. */
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

export interface Sale {''')

# ---- contracts, mock, mysql
sub('src/repositories/contracts.ts','import type { Agent, Campaign, Lead, LeadContact, LeadStatus, Sale, SalesManager } from "@/models/sales";','import type { Agent, Campaign, Lead, LeadContact, LeadStatus, MonthlyReportSnapshot, Sale, SalesManager } from "@/models/sales";')
sub('src/repositories/contracts.ts','  listLeadContacts(): Promise<LeadContact[]>;','  listMonthlyReports(): Promise<MonthlyReportSnapshot[]>;\n  saveMonthlyReport(report: MonthlyReportSnapshot): Promise<MonthlyReportSnapshot>;\n  listLeadContacts(): Promise<LeadContact[]>;')
s='src/repositories/mock/store.ts'
sub(s,'import leadContacts from "@/data/mock/lead-contacts.json";','import leadContacts from "@/data/mock/lead-contacts.json";\nimport monthlyReports from "@/data/mock/monthly-reports.json";')
sub(s,'import type { Agent, Campaign, Lead, LeadContact, Sale, SalesManager } from "@/models/sales";','import type { Agent, Campaign, Lead, LeadContact, MonthlyReportSnapshot, Sale, SalesManager } from "@/models/sales";')
sub(s,'  leadContacts: LeadContact[];','  leadContacts: LeadContact[];\n  monthlyReports: MonthlyReportSnapshot[];')
sub(s,'    leadContacts,\n','    leadContacts,\n    monthlyReports,\n')
write('src/data/mock/monthly-reports.json','[]\n')
r='src/repositories/mock/sales.repository.ts'
sub(r,'import type { Agent, Lead, LeadContact, LeadStatus, Sale, SalesManager } from "@/models/sales";','import type { Agent, Lead, LeadContact, LeadStatus, MonthlyReportSnapshot, Sale, SalesManager } from "@/models/sales";')
sub(r,'  async listLeadContacts() {','''  async listMonthlyReports() {
    return structuredClone([...getStore().monthlyReports].sort((a, b) => b.period.localeCompare(a.period)));
  }
  async saveMonthlyReport(report: MonthlyReportSnapshot) {
    const reports = getStore().monthlyReports;
    const index = reports.findIndex((r) => r.period === report.period);
    if (index === -1) reports.push(structuredClone(report));
    else reports[index] = structuredClone(report);
    return structuredClone(report);
  }
  async listLeadContacts() {''')
m='src/repositories/mysql/sales.repository.ts'
sub(m,'import type { Agent, Campaign, Lead, LeadContact, LeadStatus, Sale, SalesManager } from "@/models/sales";','import type { Agent, AgentReportRow, Campaign, Lead, LeadContact, LeadStatus, MonthlyReportSnapshot, Sale, SalesManager } from "@/models/sales";')
sub(m,'  async listLeadContacts() {','''  async listMonthlyReports() {
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
  async listLeadContacts() {''')
write('database/migrations/019_sales_reports.sql','''-- Saved monthly sales reports: one per month, kept so the history of each agent's progress is never lost.
CREATE TABLE IF NOT EXISTS sales_reports (
  period CHAR(7) NOT NULL PRIMARY KEY,               -- "2026-10"
  is_final TINYINT(1) NOT NULL DEFAULT 0,            -- 0 while the month is still running
  generated_at DATETIME(3) NOT NULL,                 -- UTC
  payload JSON NOT NULL                              -- the report rows
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
''')
sub('scripts/ci/check-schema.mjs','  lead_contacts: [','  sales_reports: ["period", "is_final", "generated_at", "payload"],\n  lead_contacts: [')

# ---- service
p='src/services/sales.service.ts'
sub(p,'import type { Agent, AgentPerformance, Campaign, Lead, LeadContact, LeadContactSummary, LeadStatus, Sale, SalesManager, SalesReport } from "@/models/sales";','import type {\n  Agent,\n  AgentPerformance,\n  AgentReportRow,\n  Campaign,\n  Lead,\n  LeadContact,\n  LeadContactSummary,\n  LeadStatus,\n  MonthlyReportSnapshot,\n  Sale,\n  SalesManager,\n  SalesReport,\n} from "@/models/sales";')
sub(p,'import { discountProblem, priceUnit } from "@/utils/pricing";','import { addMonths } from "@/utils/date";\nimport { discountProblem, priceUnit } from "@/utils/pricing";')
sub(p,'  /** How many units of each project have been sold. */','''  /**
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
  monthlyReport(period: string): Promise<AgentReportRow[]> {
    if (!/^\\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new AppError("The month must look like 2026-10", 400);
    return this.agentReport({ from: `${period}-01`, to: `${period}-31` });
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

  /** How many units of each project have been sold. */''')

# ---- operation
sub('src/server/http/operations.ts','  assignLead: {','''  saveMonthlyReport: {
    method: "POST",
    access: SALES,
    handler: (i) => salesService.saveMonthlyReport(z.object({ period: z.string().regex(/^\\d{4}-(0[1-9]|1[0-2])$/) }).parse(i).period),
  },
  assignLead: {''')
print("ok")
