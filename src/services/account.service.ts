import { z } from "zod";
import type { AccountEntry, AccountSummary } from "@/models/accounts";
import type { AccountRepository, ProjectRepository } from "@/repositories/contracts";
import { notFound } from "@/utils/errors";
import { newId, today } from "@/utils/id";

export const accountEntrySchema = z.object({
  projectId: z.string().min(1),
  type: z.enum(["debit", "credit", "expense", "sale", "purchase"]),
  amount: z.number().positive().max(10_000_000_000),
  description: z.string().trim().min(1).max(200),
  party: z.string().trim().max(120).default(""),
  date: z.iso.date().optional(),
});

export function summarize(entries: AccountEntry[]): AccountSummary {
  const total = (type: AccountEntry["type"]) =>
    entries.filter((e) => e.type === type).reduce((sum, e) => sum + e.amount, 0);
  const summary = {
    debit: total("debit"),
    credit: total("credit"),
    expense: total("expense"),
    sales: total("sale"),
    purchase: total("purchase"),
  };
  return { ...summary, balance: summary.credit + summary.sales - summary.debit - summary.expense - summary.purchase };
}

export class AccountService {
  constructor(
    private repo: AccountRepository,
    private projects: ProjectRepository,
  ) {}

  list(projectId: string): Promise<AccountEntry[]> {
    return this.repo.listByProject(projectId);
  }

  async summary(projectId: string): Promise<AccountSummary> {
    return summarize(await this.repo.listByProject(projectId));
  }

  async addEntry(input: unknown): Promise<AccountEntry> {
    const data = accountEntrySchema.parse(input);
    if (!(await this.projects.findById(data.projectId))) throw notFound("Project");
    return this.repo.add({ ...data, id: newId("ac"), date: data.date ?? today() });
  }
}
