export type AccountEntryType = "debit" | "credit" | "expense" | "sale" | "purchase";

export interface AccountEntry {
  id: string;
  projectId: string;
  date: string; // ISO date
  type: AccountEntryType;
  amount: number;
  description: string;
  party: string;
}

export interface AccountSummary {
  debit: number;
  credit: number;
  expense: number;
  sales: number;
  purchase: number;
  balance: number; // credit + sales - debit - expense - purchase
}
