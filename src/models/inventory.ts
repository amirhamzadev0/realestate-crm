export type MaterialCategory = "structure" | "finishing" | "plumbing" | "electrical";

export interface Material {
  id: string;
  name: string; // Steel, Premix, Cement ...
  category: MaterialCategory;
  unit: string; // kg, bag, ton, pcs
}

/** Stock of one material at a project site. There is no central warehouse stock: material is ordered for a project. */
export interface StockItem {
  id: string;
  projectId: string;
  materialId: string;
  quantity: number; // currently in stock
  used: number; // consumed so far
  minLevel: number; // low-stock threshold
}

/**
 * pending   - the project manager asked; waiting for the Super Admin
 * ordered   - approved (or ordered directly by the Super Admin); the material is being bought and has not arrived
 * fulfilled - the material arrived and is now in the project inventory
 * rejected  - turned down, or the order was cancelled
 */
export type RequestStatus = "pending" | "ordered" | "rejected" | "fulfilled";

/** How an order is paid: part of it up front, or all of it when the material is delivered. */
export type PaymentTerms = "advance" | "on-delivery";

/** One part of an order arriving at the project. */
export interface Delivery {
  date: string; // ISO date
  quantity: number;
}

/** One payment to the vendor of an order. */
export interface OrderPayment {
  date: string; // ISO date
  amount: number;
}

/** A project's material request, or an order the Super Admin placed directly. */
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
  orderedAt?: string; // the day the order was placed
  receivedAt?: string; // when the last of the material arrived (the order is then fulfilled)
  payments?: OrderPayment[]; // each payment to the vendor, oldest first
  deliveries?: Delivery[]; // the parts that have arrived so far, oldest first
  // Order details, set when the order is placed. Payments are debited from the project's accounts.
  vendor?: string;
  totalAmount?: number; // PKR the material costs
  paymentTerms?: PaymentTerms;
  amountPaid?: number; // PKR paid to the vendor so far (the advance, then any balance payments)
  paidAt?: string; // the day the order was paid in full
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
  receivedQuantity: number; // how much has arrived so far
  remainingQuantity: number; // how much is still to come
  balanceDue: number; // totalAmount - amountPaid, 0 when the order has no amount
}
