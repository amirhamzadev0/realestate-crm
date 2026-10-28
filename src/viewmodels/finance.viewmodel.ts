import "server-only";

import { cache } from "react";
import type { InstallmentState, InstallmentView } from "@/models/finance";
import { financeService, projectService, salesService } from "@/server/container";
import { ledgerSummary } from "@/utils/ledger";

/** The instalments that need a call or a message now, for the bell and the banner on every Finance page. */
export const getFinanceAttention = cache(async () => financeService.attention());

export const getFinanceOverview = cache(async () => {
  const [summary, attention] = await Promise.all([financeService.summary(), getFinanceAttention()]);
  return { summary, attention };
});

export type InstallmentFilter = "open" | "overdue" | "due-today" | "promised" | "upcoming" | "paid" | "all";
export const INSTALMENT_FILTERS: InstallmentFilter[] = ["open", "overdue", "due-today", "promised", "upcoming", "paid", "all"];
const LIMIT = 300;

/** Every instalment of every project (or one project), filtered by its state; the first few hundred are shown. */
export const getInstallmentsPage = cache(async (projectSlug?: string, filter: InstallmentFilter = "open", search = "") => {
  const projects = await projectService.list();
  const project = projects.find((p) => p.slug === projectSlug) ?? null;
  const all = await financeService.list(project ? { projectId: project.id } : undefined);
  const matches = (i: InstallmentView) => (filter === "all" ? true : filter === "open" ? i.state !== "paid" : i.state === (filter as InstallmentState));
  const needle = search.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const found = (i: InstallmentView) =>
    !needle || i.buyer.toLowerCase().includes(needle) || i.unit.toLowerCase().includes(needle) || (digits !== "" && i.buyerPhone.replace(/\D/g, "").includes(digits));
  const rows = all.filter((i) => matches(i) && found(i));
  return { projects, project, filter, rows: rows.slice(0, LIMIT), total: rows.length, shownAll: rows.length <= LIMIT };
});

/** The units sold on instalments, each with what was paid, what is owed and what comes next. */
export const getBookedSales = cache(async (projectSlug?: string) => {
  const [projects, sales, items] = await Promise.all([projectService.list(), salesService.listSales(), financeService.list()]);
  const project = projects.find((p) => p.slug === projectSlug) ?? null;
  const rows = sales
    .filter((s) => s.paymentType === "installment" && (!project || s.projectId === project.id))
    .map((sale) => {
      const own = items.filter((i) => i.saleId === sale.id);
      const open = own.filter((i) => i.state !== "paid");
      const next = open.find((i) => i.dueDate !== null) ?? open[0];
      return {
        sale,
        projectName: projects.find((p) => p.id === sale.projectId)?.name ?? "-",
        paid: own.reduce((sum, i) => sum + i.paid, 0),
        remaining: open.reduce((sum, i) => sum + i.remaining, 0),
        left: open.length,
        total: own.length,
        overdue: open.filter((i) => i.state === "overdue").length,
        next,
      };
    })
    .sort((a, b) => Number(b.sale.status === "booked") - Number(a.sale.status === "booked") || b.sale.date.localeCompare(a.sale.date));
  return { projects, project, rows };
});

export const getSalePlan = cache(async (saleId: string) => financeService.saleSchedule(saleId));

export type LedgerStatus = "all" | "booked" | "sold";

/** Every buyer on a payment plan with the headline numbers of their plan, filtered by project, name and whether it is still running. */
export const getLedgers = cache(async (projectSlug?: string, search = "", status: LedgerStatus = "all") => {
  const [projects, sales, items] = await Promise.all([projectService.list(), salesService.listSales(), financeService.list()]);
  const project = projects.find((p) => p.slug === projectSlug) ?? null;
  const needle = search.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const rows = sales
    .filter((s) => s.paymentType === "installment" && (!project || s.projectId === project.id))
    .filter((s) => status === "all" || (status === "booked") === (s.status === "booked"))
    .filter(
      (s) =>
        !needle ||
        (s.buyer ?? "").toLowerCase().includes(needle) ||
        s.unit.toLowerCase().includes(needle) ||
        (digits !== "" && (s.buyerPhone ?? "").replace(/\D/g, "").includes(digits)),
    )
    .map((sale) => {
      const own = items.filter((i) => i.saleId === sale.id);
      return { sale, projectName: projects.find((p) => p.id === sale.projectId)?.name ?? "-", summary: ledgerSummary(sale, own) };
    })
    .sort((a, b) => b.sale.date.localeCompare(a.sale.date));
  return { projects, project, rows };
});

/** One buyer's ledger: the plan's headline numbers, and every payment with the newest on top. */
export const getLedger = cache(async (saleId: string) => {
  const plan = await financeService.saleSchedule(saleId);
  if (!plan) return null;
  const items = [...plan.items].sort((a, b) => (b.dueDate ?? "9999").localeCompare(a.dueDate ?? "9999") || b.seq - a.seq);
  return { sale: plan.sale, projectName: plan.projectName, items, ordered: plan.items, summary: ledgerSummary(plan.sale, plan.items) };
});
