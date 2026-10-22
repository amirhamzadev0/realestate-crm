import "server-only";

import { cache } from "react";
import { inventoryService, projectService } from "@/server/container";

/** The orders desk: place an order for a project, see what is on its way and what has arrived. */
export const getOrdersPage = cache(async () => {
  const [requests, materials, projects] = await Promise.all([
    inventoryService.listRequests(),
    inventoryService.listMaterials(),
    projectService.list(),
  ]);
  return {
    materials,
    projects,
    onOrder: requests.filter((r) => r.status === "ordered"),
    paymentsDue: requests.filter((r) => r.status === "fulfilled" && r.balanceDue > 0),
    awaitingApproval: requests.filter((r) => r.status === "pending"),
    history: requests.filter((r) => r.status === "fulfilled" || r.status === "rejected"),
  };
});
