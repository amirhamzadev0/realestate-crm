import type { Project } from "@/models/project";
import type { AccountEntry } from "@/models/accounts";
import type { Material, MaterialRequest, RequestStatus, StockItem } from "@/models/inventory";
import type { AssignmentStatus, AttendanceRecord, Worker, WorkAssignment } from "@/models/hr";
import type { Agent, Campaign, Lead, LeadStatus, Sale } from "@/models/sales";
import type { ChangeRequest, ChangeStatus } from "@/models/changes";
import type { PortalInfo } from "@/models/site";

export interface SiteRepository {
  getInfo(): Promise<{ name: string; tagline: string; portals: PortalInfo[] }>;
}

export interface ProjectRepository {
  list(): Promise<Project[]>;
  findBySlug(slug: string): Promise<Project | null>;
  findById(id: string): Promise<Project | null>;
}

export interface AccountRepository {
  listByProject(projectId: string): Promise<AccountEntry[]>;
  add(entry: AccountEntry): Promise<AccountEntry>;
}

export interface InventoryRepository {
  listMaterials(): Promise<Material[]>;
  saveMaterial(material: Material): Promise<Material>;
  listStock(scope: "project" | "warehouse", projectId?: string): Promise<StockItem[]>;
  findStock(scope: "project" | "warehouse", projectId: string | null, materialId: string): Promise<StockItem | null>;
  saveStock(item: StockItem): Promise<StockItem>;
  listRequests(filter?: { projectId?: string; status?: RequestStatus }): Promise<MaterialRequest[]>;
  findRequest(id: string): Promise<MaterialRequest | null>;
  saveRequest(request: MaterialRequest): Promise<MaterialRequest>;
}

export interface HrRepository {
  listWorkers(projectId: string): Promise<Worker[]>;
  findWorker(id: string): Promise<Worker | null>;
  saveWorker(worker: Worker): Promise<Worker>;
  removeWorker(id: string): Promise<boolean>;
  listAttendance(projectId: string): Promise<AttendanceRecord[]>;
  saveAttendance(record: AttendanceRecord): Promise<AttendanceRecord>;
  listAssignments(projectId: string): Promise<WorkAssignment[]>;
  saveAssignment(assignment: WorkAssignment): Promise<WorkAssignment>;
  setAssignmentStatus(id: string, status: AssignmentStatus): Promise<WorkAssignment | null>;
}

export interface SalesRepository {
  listAgents(): Promise<Agent[]>;
  saveAgent(agent: Agent): Promise<Agent>;
  listCampaigns(): Promise<Campaign[]>;
  listLeads(): Promise<Lead[]>;
  saveLead(lead: Lead): Promise<Lead>;
  setLeadStatus(id: string, status: LeadStatus): Promise<Lead | null>;
  listSales(): Promise<Sale[]>;
  saveSale(sale: Sale): Promise<Sale>;
}

export interface ChangeRequestRepository {
  list(filter?: { projectId?: string; status?: ChangeStatus; kind?: ChangeRequest["kind"] }): Promise<ChangeRequest[]>;
  find(id: string): Promise<ChangeRequest | null>;
  save(request: ChangeRequest): Promise<ChangeRequest>;
}
