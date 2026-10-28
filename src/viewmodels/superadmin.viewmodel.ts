import "server-only";

import { cache } from "react";
import type { PlotCategory } from "@/models/project";
import { addDays } from "@/utils/date";
import { today } from "@/utils/id";
import { closedOrders, HISTORY_LIMIT } from "@/viewmodels/warehouse.viewmodel";
import { accountService, changeRequestService, financeService, hrService, inventoryService, projectService, salesService } from "@/server/container";

/** The day of the newest delivery of an order, or "" when nothing has arrived. */
const lastDelivery = (r: { deliveries?: { date: string }[]; receivedAt?: string }) => r.deliveries?.at(-1)?.date ?? r.receivedAt ?? "";

export const getSuperAdminDashboard = cache(async () => {
  const projects = await projectService.list();
  const [soldByProject, soldByCategory] = await Promise.all([salesService.unitsSold(), salesService.soldByCategory()]);

  const [rows, requests, report, pendingPeople, materials, pendingPayroll, instalments] = await Promise.all([
    Promise.all(
      projects.map(async (project) => {
        const [accounts, hr] = await Promise.all([accountService.summary(project.id), hrService.summary(project.id)]);
        return { project, accounts, hr, unitsSold: soldByProject.get(project.id) ?? 0, soldByCategory: soldByCategory.get(project.id) ?? {} };
      }),
    ),
    inventoryService.listRequests(),
    salesService.report(),
    changeRequestService.list({ status: "pending" }),
    inventoryService.listMaterials(),
    Promise.all(projects.map((project) => hrService.pendingPayroll(project.id))).then((lists) => lists.flat()),
    financeService.summary(),
  ]);

  const combined = rows.reduce(
    (sum, r) => ({
      credit: sum.credit + r.accounts.credit,
      debit: sum.debit + r.accounts.debit,
      expense: sum.expense + r.accounts.expense,
      sales: sum.sales + r.accounts.sales,
      purchase: sum.purchase + r.accounts.purchase,
      balance: sum.balance + r.accounts.balance,
    }),
    { credit: 0, debit: 0, expense: 0, sales: 0, purchase: 0, balance: 0 },
  );
  const projectName = Object.fromEntries(projects.map((project) => [project.id, project.name]));

  // Who is waiting for money: vendors with delivered orders not fully paid, and staff or labour with pay that has come due.
  const dueOrders = requests.filter((r) => r.status === "fulfilled" && r.balanceDue > 0);
  const vendors = new Map<string, { name: string; orders: number; amount: number }>();
  for (const order of dueOrders) {
    const name = order.vendor?.trim() || "Vendor not named";
    const entry = vendors.get(name) ?? { name, orders: 0, amount: 0 };
    entry.orders += 1;
    entry.amount += order.balanceDue;
    vendors.set(name, entry);
  }
  const people = new Map<string, { name: string; project: string; items: number; amount: number }>();
  for (const item of pendingPayroll) {
    const key = `${item.workerId}|${item.projectId}`;
    const entry = people.get(key) ?? { name: item.workerName, project: projectName[item.projectId] ?? "-", items: 0, amount: 0 };
    entry.items += 1;
    entry.amount += item.amount;
    people.set(key, entry);
  }
  const owedToVendors = [...vendors.values()].sort((a, b) => b.amount - a.amount);
  const owedToPeople = [...people.values()].sort((a, b) => b.amount - a.amount);

  return {
    rows,
    instalments,
    combined,
    owed: {
      vendors: owedToVendors,
      people: owedToPeople,
      vendorTotal: owedToVendors.reduce((sum, v) => sum + v.amount, 0),
      peopleTotal: owedToPeople.reduce((sum, p) => sum + p.amount, 0),
    },
    materials,
    pendingPayroll,
    projectNames: Object.fromEntries(projects.map((project) => [project.id, project.name])),
    projects,
    pendingRequests: requests.filter((r) => r.status === "pending"),
    onOrder: requests.filter((r) => r.status === "ordered"),
    paymentsDue: requests.filter((r) => r.status === "fulfilled" && r.balanceDue > 0),
    // Orders the project managers marked received in the last two weeks, newest first, so the Super Admin sees them arrive.
    // Part deliveries count too: the order shows how much arrived and how much is still to come.
    recentlyReceived: requests
      .filter((r) => lastDelivery(r) >= addDays(today(), -14))
      .sort((a, b) => lastDelivery(b).localeCompare(lastDelivery(a))),
    pendingPeople,
    sales: report,
    totals: {
      projects: projects.length,
      balance: rows.reduce((sum, r) => sum + r.accounts.balance, 0),
      workers: rows.reduce((sum, r) => sum + r.hr.employees + r.hr.labour, 0),
    },
  };
});

export const getApprovalsPage = cache(async () => {
  const [requests, people] = await Promise.all([inventoryService.listRequests(), changeRequestService.list()]);
  return {
    pending: requests.filter((r) => r.status === "pending"),
    onOrder: requests.filter((r) => r.status === "ordered"),
    paymentsDue: requests.filter((r) => r.status === "fulfilled" && r.balanceDue > 0),
    history: closedOrders(requests).slice(0, HISTORY_LIMIT),
    historyTotal: closedOrders(requests).length,
    pendingPeople: people.filter((r) => r.status === "pending"),
    peopleHistory: people.filter((r) => r.status !== "pending"),
  };
});

/** Projects with their figures, plus every manager and which project they run. */
export const getProjectsManagement = cache(async () => {
  const [rows, managers] = await Promise.all([getProjectsOverview(), projectService.listManagers()]);
  return { rows, managers };
});

export const getProjectsOverview = cache(async () => {
  const [projects, soldByProject, soldByCategory] = await Promise.all([
    projectService.list(),
    salesService.unitsSold(),
    salesService.soldByCategory(),
  ]);
  return Promise.all(
    projects.map(async (project) => ({
      project,
      unitsSold: soldByProject.get(project.id) ?? 0,
      soldByCategory: soldByCategory.get(project.id) ?? {},
      accounts: await accountService.summary(project.id),
      hr: await hrService.summary(project.id),
    })),
  );
});

/** Projects with their units left, and the chosen project (by slug) with its sales for the Direct sales page. */
export const getDirectSalesPage = cache(async (slug?: string) => {
  const [projects, soldByProject, allSales, agents] = await Promise.all([
    projectService.list(),
    salesService.unitsSold(),
    salesService.listSales(),
    salesService.listAgents(),
  ]);
  const rows = projects.map((project) => {
    const unitsSold = soldByProject.get(project.id) ?? 0;
    return { project, unitsSold, unitsLeft: Math.max(0, project.totalUnits - unitsSold) };
  });
  const chosen = rows.find((row) => row.project.slug === slug);
  const soldByCategory = chosen ? ((await salesService.soldByCategory()).get(chosen.project.id) ?? {}) : {};
  const categoryRows = chosen
    ? chosen.project.rates.map((r) => {
        const sold = soldByCategory[r.category] ?? 0;
        return { ...r, sold, left: r.units === undefined ? undefined : Math.max(0, r.units - sold) };
      })
    : [];
  // For a high-rise: every plot type and floor with its units, how many are sold and how many are free.
  const freeUnits = chosen ? ((await salesService.availableUnits([chosen.project])).get(chosen.project.id) ?? []) : [];
  const floorRows = chosen
    ? [...new Set(chosen.project.units.map((u) => `${u.category}|${u.floor}`))].map((key) => {
        const [category, floor] = key.split("|") as [PlotCategory, string];
        const all = chosen.project.units.filter((u) => u.category === category && u.floor === floor);
        const free = freeUnits.filter((u) => u.category === category && u.floor === floor).length;
        return { category, floor, total: all.length, sold: all.length - free, free, area: all.map((u) => u.area) };
      })
    : [];
  // Every unit of a high-rise with whether it is sold, and the sale when it is, for the units list.
  const unitRows = chosen
    ? chosen.project.units.map((u) => ({
        ...u,
        sale: allSales.find((s) => s.projectId === chosen.project.id && s.unit.toLowerCase() === u.unit.toLowerCase()) ?? null,
      }))
    : [];
  const saleProject = chosen ? (await salesService.saleProjects([chosen.project]))[0] : null;
  const sales = chosen ? allSales.filter((s) => s.projectId === chosen.project.id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  return {
    projects: rows,
    selected: chosen
      ? {
          ...chosen,
          sales,
          categoryRows,
          floorRows,
          unitRows,
          saleProject,
          revenue: sales.reduce((sum, s) => sum + s.price, 0),
          agentNames: Object.fromEntries(agents.map((a) => [a.id, a.name])),
        }
      : null,
  };
});

/** The sales department for the Super Admin: its managers with their team size, and every agent with their results. */
export const getSalesTeamPage = cache(async () => {
  const [managers, agents, sales, report] = await Promise.all([
    salesService.listSalesManagers(),
    salesService.listAgents(),
    salesService.listSales(),
    salesService.report(),
  ]);
  const managerName = new Map(managers.map((m) => [m.id, m.name]));
  const performance = new Map(report.agents.map((a) => [a.agentId, a]));
  return {
    managers: managers.map((m) => ({
      ...m,
      agentCount: agents.filter((a) => a.managerId === m.id && a.active).length,
      ownSales: sales.filter((s) => s.soldByManagerId === m.id).length,
    })),
    agents: agents
      .filter((a) => a.active)
      .map((a) => ({
        ...a,
        managerName: a.managerId ? (managerName.get(a.managerId) ?? "-") : "-",
        sales: performance.get(a.id)?.sales ?? 0,
        revenue: performance.get(a.id)?.revenue ?? 0,
        commission: performance.get(a.id)?.commission ?? 0,
      })),
  };
});
