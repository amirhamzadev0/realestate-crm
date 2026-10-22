import "server-only";

import { cache } from "react";
import { accountService, changeRequestService, hrService, inventoryService, projectService } from "@/server/container";

/** Resolves the project for a slug. Returns null so the page can call notFound(). */
export const getProjectShell = cache(async (slug: string) => projectService.findBySlug(slug));

export const getProjectOverview = cache(async (slug: string) => {
  const project = await projectService.findBySlug(slug);
  if (!project) return null;
  const [accounts, hr, stock, requests] = await Promise.all([
    accountService.summary(project.id),
    hrService.summary(project.id),
    inventoryService.projectStock(project.id),
    inventoryService.listRequests({ projectId: project.id }),
  ]);
  return {
    project,
    accounts,
    hr,
    lowStock: stock.filter((s) => s.low),
    openRequests: requests.filter((r) => r.status === "pending" || r.status === "ordered"),
  };
});

export const getProjectAccounts = cache(async (slug: string) => {
  const project = await projectService.findBySlug(slug);
  if (!project) return null;
  const [summary, entries] = await Promise.all([accountService.summary(project.id), accountService.list(project.id)]);
  return { project, summary, entries };
});

export const getProjectInventory = cache(async (slug: string) => {
  const project = await projectService.findBySlug(slug);
  if (!project) return null;
  const [stock, requests, materials] = await Promise.all([
    inventoryService.projectStock(project.id),
    inventoryService.listRequests({ projectId: project.id }),
    inventoryService.listMaterials(),
  ]);
  return { project, stock, requests, materials };
});

export const getProjectHr = cache(async (slug: string, date?: string) => {
  const project = await projectService.findBySlug(slug);
  if (!project) return null;
  const [summary, workers, assignments, changes, report, pending, paid] = await Promise.all([
    hrService.summary(project.id),
    hrService.listWorkers(project.id),
    hrService.listAssignments(project.id),
    changeRequestService.list({ projectId: project.id, kind: "worker" }),
    hrService.workReport(project.id, date),
    hrService.pendingPayroll(project.id),
    hrService.paidPayroll(project.id),
  ]);
  const pendingIds = changes.filter((c) => c.status === "pending" && c.targetId).map((c) => c.targetId as string);
  return { project, summary, workers, assignments, changes, pendingIds, report, pending, paid };
});
