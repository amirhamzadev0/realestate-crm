export type MaterialCategory = "structure" | "finishing" | "plumbing" | "electrical";

export interface Material {
  id: string;
  name: string; // Steel, Premix, Cement ...
  category: MaterialCategory;
  unit: string; // kg, bag, ton, pcs
}

/** Stock of one material, either at a project site or in the central warehouse. */
export interface StockItem {
  id: string;
  scope: "project" | "warehouse";
  projectId: string | null; // null for the warehouse
  materialId: string;
  quantity: number; // currently in stock
  used: number; // consumed so far
  minLevel: number; // low-stock threshold
}

export type RequestStatus = "pending" | "approved" | "rejected" | "fulfilled";

/** Project admin asks the super admin for material. Approved requests are fulfilled from the warehouse. */
export interface MaterialRequest {
  id: string;
  projectId: string;
  materialId: string;
  quantity: number;
  note: string;
  requestedBy: string;
  createdAt: string; // ISO date
  status: RequestStatus;
  decisionNote?: string;
  decidedAt?: string;
}

export interface StockView extends StockItem {
  materialName: string;
  unit: string;
  low: boolean;
}

export interface MaterialRequestView extends MaterialRequest {
  materialName: string;
  unit: string;
  projectName: string;
}
