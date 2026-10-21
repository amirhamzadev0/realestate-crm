import "server-only";

import { cache } from "react";
import { inventoryService, projectService } from "@/server/container";

export const getWarehousePage = cache(async () => {
  const [stock, requests, materials, projects] = await Promise.all([
    inventoryService.warehouseStock(),
    inventoryService.listRequests(),
    inventoryService.listMaterials(),
    projectService.list(),
  ]);
  return {
    stock,
    materials,
    projects,
    // Requests the warehouse can still act on: waiting for the Super Admin, or approved but not yet issued.
    openRequests: requests.filter((r) => r.status === "pending" || r.status === "approved"),
    history: requests.filter((r) => r.status === "fulfilled" || r.status === "rejected"),
    toIssue: requests.filter((r) => r.status === "approved"),
    issued: requests.filter((r) => r.status === "fulfilled"),
    awaitingApproval: requests.filter((r) => r.status === "pending"),
  };
});
