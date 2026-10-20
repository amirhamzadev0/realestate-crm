import accounts from "@/data/mock/accounts.json";
import agents from "@/data/mock/agents.json";
import assignments from "@/data/mock/assignments.json";
import attendance from "@/data/mock/attendance.json";
import changeRequests from "@/data/mock/change-requests.json";
import campaigns from "@/data/mock/campaigns.json";
import leads from "@/data/mock/leads.json";
import materialRequests from "@/data/mock/material-requests.json";
import materials from "@/data/mock/materials.json";
import payments from "@/data/mock/payments.json";
import projects from "@/data/mock/projects.json";
import sales from "@/data/mock/sales.json";
import site from "@/data/mock/site.json";
import stock from "@/data/mock/stock.json";
import workers from "@/data/mock/workers.json";
import type { AccountEntry } from "@/models/accounts";
import type { ChangeRequest } from "@/models/changes";
import type { Material, MaterialRequest, StockItem } from "@/models/inventory";
import type { AttendanceRecord, PayrollPayment, Worker, WorkAssignment } from "@/models/hr";
import type { Project } from "@/models/project";
import type { Agent, Campaign, Lead, Sale } from "@/models/sales";
import type { PortalInfo } from "@/models/site";

export interface MockStore {
  site: { name: string; tagline: string; portals: PortalInfo[] };
  projects: Project[];
  accounts: AccountEntry[];
  materials: Material[];
  stock: StockItem[];
  requests: MaterialRequest[];
  workers: Worker[];
  attendance: AttendanceRecord[];
  assignments: WorkAssignment[];
  payments: PayrollPayment[];
  agents: Agent[];
  campaigns: Campaign[];
  leads: Lead[];
  sales: Sale[];
  changeRequests: ChangeRequest[];
}

const KEY = "__crm_mock_store__";
type GlobalWithStore = typeof globalThis & { [KEY]?: MockStore };

/**
 * Phase 1 only: a mutable in-memory copy of the JSON seed so forms work during a
 * session. The cast is needed because JSON imports widen string unions to `string`.
 * Kept on globalThis so dev hot-reload does not reset it.
 */
export function getStore(): MockStore {
  const g = globalThis as GlobalWithStore;
  g[KEY] ??= structuredClone({
    site,
    projects,
    accounts,
    materials,
    stock,
    requests: materialRequests,
    workers,
    attendance,
    assignments,
    payments,
    agents,
    campaigns,
    leads,
    sales,
    changeRequests,
  }) as unknown as MockStore;
  return g[KEY];
}

export function upsert<T extends { id: string }>(list: T[], item: T): T {
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index === -1) list.push(structuredClone(item));
  else list[index] = structuredClone(item);
  return structuredClone(item);
}
