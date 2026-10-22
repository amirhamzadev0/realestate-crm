import "server-only";

import { cache } from "react";
import type { PlotCategory } from "@/models/project";
import { accountService, changeRequestService, hrService, inventoryService, projectService, salesService } from "@/server/container";

export const getSuperAdminDashboard = cache(async () => {
  const projects = await projectService.list();
  const [soldByProject, soldByCategory] = await Promise.all([salesService.unitsSold(), salesService.soldByCategory()]);

  const [rows, requests, report, pendingPeople, materials, pendingPayroll] = await Promise.all([
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
  ]);

  return {
    rows,
    materials,
    pendingPayroll,
    projectNames: Object.fromEntries(projects.map((project) => [project.id, project.name])),
    projects,
    pendingRequests: requests.filter((r) => r.status === "pending"),
    onOrder: requests.filter((r) => r.status === "ordered"),
    paymentsDue: requests.filter((r) => r.status === "fulfilled" && r.balanceDue > 0),
    // Orders the project managers marked received in the last two weeks, newest first, so the Super Admin sees them arrive.
    recentlyReceived: requests
      .filter((r) => r.status === "fulfilled" && (r.receivedAt ?? "") >= new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10))
      .sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? "")),
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
    history: requests.filter((r) => r.status === "fulfilled" || r.status === "rejected"),
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
          saleProject,
          revenue: sales.reduce((sum, s) => sum + s.price, 0),
          agentNames: Object.fromEntries(agents.map((a) => [a.id, a.name])),
        }
      : null,
  };
});
