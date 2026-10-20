import "server-only";

import { cache } from "react";
import { accountService, changeRequestService, hrService, inventoryService, projectService, salesService } from "@/server/container";

export const getSuperAdminDashboard = cache(async () => {
  const projects = await projectService.list();

  const [rows, pending, warehouse, report, pendingPeople, materials] = await Promise.all([
    Promise.all(
      projects.map(async (project) => {
        const [accounts, hr] = await Promise.all([accountService.summary(project.id), hrService.summary(project.id)]);
        return { project, accounts, hr };
      }),
    ),
    inventoryService.listRequests({ status: "pending" }),
    inventoryService.warehouseStock(),
    salesService.report(),
    changeRequestService.list({ status: "pending" }),
    inventoryService.listMaterials(),
  ]);

  return {
    rows,
    materials,
    warehouseStock: warehouse,
    pendingRequests: pending,
    pendingPeople,
    lowWarehouseStock: warehouse.filter((s) => s.low),
    sales: report,
    totals: {
      projects: projects.length,
      balance: rows.reduce((sum, r) => sum + r.accounts.balance, 0),
      workers: rows.reduce((sum, r) => sum + r.hr.employees + r.hr.labour, 0),
    },
  };
});

export const getApprovalsPage = cache(async () => {
  const [requests, people, warehouse] = await Promise.all([
    inventoryService.listRequests(),
    changeRequestService.list(),
    inventoryService.warehouseStock(),
  ]);
  return {
    pending: requests.filter((r) => r.status === "pending"),
    history: requests.filter((r) => r.status !== "pending"),
    warehouse,
    pendingPeople: people.filter((r) => r.status === "pending"),
    peopleHistory: people.filter((r) => r.status !== "pending"),
  };
});

export const getProjectsOverview = cache(async () => {
  const projects = await projectService.list();
  return Promise.all(
    projects.map(async (project) => ({
      project,
      accounts: await accountService.summary(project.id),
      hr: await hrService.summary(project.id),
    })),
  );
});
