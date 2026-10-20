import "server-only";

import { cache } from "react";
import { inventoryService } from "@/server/container";

export const getWarehousePage = cache(async () => {
  const [stock, requests, materials] = await Promise.all([
    inventoryService.warehouseStock(),
    inventoryService.listRequests(),
    inventoryService.listMaterials(),
  ]);
  return {
    stock,
    materials,
    toIssue: requests.filter((r) => r.status === "approved"),
    issued: requests.filter((r) => r.status === "fulfilled"),
    awaitingApproval: requests.filter((r) => r.status === "pending"),
  };
});
