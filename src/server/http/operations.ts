import "server-only";

import { cookies } from "next/headers";
import { z } from "zod";
import type { AuthUser } from "@/models/auth";
import type { Role } from "@/models/site";
import {
  accountService,
  authService,
  changeRequestService,
  hrService,
  inventoryService,
  projectService,
  salesService,
} from "@/server/container";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/services/auth.service";
import { leadStatusSchema } from "@/services/sales.service";
import { AppError } from "@/utils/errors";

type Input = Record<string, unknown>;

/** Anyone may call a public operation; every other operation needs a session whose role is listed. */
export type Operation =
  | { method: "GET" | "POST"; access: "public"; handler: (input: Input, user: AuthUser | null) => Promise<unknown> }
  | {
      method: "GET" | "POST";
      access: Role[];
      /** A project admin is pinned to their own project: `projectId` is filled in, a different one is refused. */
      projectScoped?: boolean;
      handler: (input: Input, user: AuthUser) => Promise<unknown>;
    };

const projectIdQuery = z.object({ projectId: z.string().min(1) });

const ADMIN: Role[] = ["superadmin"];
const PROJECT: Role[] = ["superadmin", "project-admin"];
const STORE: Role[] = ["superadmin", "warehouse"];
const SALES: Role[] = ["superadmin", "sales"];
const STORE_AND_SITE: Role[] = ["superadmin", "warehouse", "project-admin"];
const PEOPLE_REQUESTERS: Role[] = ["superadmin", "project-admin", "sales"];
const EVERYONE: Role[] = ["superadmin", "project-admin", "warehouse", "sales"];

const forbidden = (message: string) => new AppError(message, 403);

/** Project admins may only touch their own workers and tasks, even when the request carries only an id. */
async function assertOwnWorker(user: AuthUser, workerId: string) {
  if (user.role !== "project-admin") return;
  if ((await hrService.getWorker(workerId)).projectId !== user.projectId) throw forbidden("Not your project");
}

async function assertOwnTask(user: AuthUser, taskId: string) {
  if (user.role !== "project-admin" || !user.projectId) return;
  if (!(await hrService.listAssignments(user.projectId)).some((a) => a.id === taskId)) throw forbidden("Not your project");
}

export const operations: Record<string, Operation> = {
  // ---- session ----
  login: {
    method: "POST",
    access: "public",
    handler: async (input) => {
      const { token, user, home } = await authService.login(input);
      (await cookies()).set(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.APP_ORIGIN?.startsWith("https://") ?? false,
        path: "/",
        maxAge: SESSION_MAX_AGE,
      });
      return { user, home };
    },
  },
  logout: {
    method: "POST",
    access: "public",
    handler: async () => {
      const jar = await cookies();
      await authService.logout(jar.get(SESSION_COOKIE)?.value);
      jar.delete(SESSION_COOKIE);
      return { signedOut: true };
    },
  },
  getSession: {
    method: "GET",
    access: "public",
    handler: async (_input, user) => (user ? { user, home: await authService.homeFor(user) } : { user: null }),
  },

  // ---- reads ----
  getProjectList: {
    method: "GET",
    access: EVERYONE,
    handler: async (_input, user) => {
      const projects = await projectService.list();
      return user.role === "project-admin" ? projects.filter((p) => p.id === user.projectId) : projects;
    },
  },
  getAccountList: { method: "GET", access: PROJECT, projectScoped: true, handler: (i) => accountService.list(projectIdQuery.parse(i).projectId) },
  getAccountSummary: { method: "GET", access: PROJECT, projectScoped: true, handler: (i) => accountService.summary(projectIdQuery.parse(i).projectId) },
  getProjectStock: { method: "GET", access: PROJECT, projectScoped: true, handler: (i) => inventoryService.projectStock(projectIdQuery.parse(i).projectId) },
  getWarehouseStock: { method: "GET", access: STORE, handler: () => inventoryService.warehouseStock() },
  getRequestList: {
    method: "GET",
    access: STORE_AND_SITE,
    projectScoped: true,
    handler: (i) =>
      inventoryService.listRequests(
        z.object({ projectId: z.string().optional(), status: z.enum(["pending", "approved", "rejected", "fulfilled"]).optional() }).parse(i),
      ),
  },
  getChangeRequestList: {
    method: "GET",
    access: PEOPLE_REQUESTERS,
    projectScoped: true,
    handler: (i) =>
      changeRequestService.list(
        z
          .object({
            projectId: z.string().optional(),
            status: z.enum(["pending", "approved", "rejected"]).optional(),
            kind: z.enum(["worker", "agent"]).optional(),
          })
          .parse(i),
      ),
  },
  getWorkerList: { method: "GET", access: PROJECT, projectScoped: true, handler: (i) => hrService.listWorkers(projectIdQuery.parse(i).projectId) },
  getLeadList: {
    method: "GET",
    access: SALES,
    handler: (i) => salesService.listLeads(z.object({ projectId: z.string().optional(), status: leadStatusSchema.optional() }).parse(i)),
  },
  getSalesReport: {
    method: "GET",
    access: SALES,
    handler: (i) => salesService.report(z.object({ projectId: z.string().optional() }).parse(i).projectId),
  },

  // ---- writes ----
  addAccountEntry: { method: "POST", access: PROJECT, projectScoped: true, handler: (i) => accountService.addEntry(i) },
  submitMaterialRequest: {
    method: "POST",
    access: PROJECT,
    projectScoped: true,
    // The name on a request is the signed-in person, never what the browser sends.
    handler: (i, user) => inventoryService.createRequest({ ...i, requestedBy: user.name }),
  },
  decideMaterialRequest: { method: "POST", access: ADMIN, handler: (i) => inventoryService.decide(i) },
  fulfillMaterialRequest: {
    method: "POST",
    access: STORE,
    handler: (i) => inventoryService.fulfill(z.object({ requestId: z.string().min(1) }).parse(i).requestId),
  },
  recordMaterialUsage: { method: "POST", access: PROJECT, projectScoped: true, handler: (i) => inventoryService.recordUsage(i) },
  addWarehouseItem: { method: "POST", access: STORE, handler: (i) => inventoryService.addNewItemToWarehouse(i) },
  receiveWarehouseStock: { method: "POST", access: STORE, handler: (i) => inventoryService.receiveIntoWarehouse(i) },
  // People (workers, labour, agents) are only ever changed through a request the Super Admin approves.
  requestPersonChange: {
    method: "POST",
    access: PEOPLE_REQUESTERS,
    projectScoped: true,
    handler: async (i, user) => {
      const data = z.object({ kind: z.enum(["worker", "agent"]), targetId: z.string().optional() }).parse(i);
      if (user.role === "project-admin" && data.kind !== "worker") throw forbidden("Project admins can only change workers");
      if (user.role === "sales" && data.kind !== "agent") throw forbidden("Sales can only change agents");
      if (data.kind === "worker" && data.targetId) await assertOwnWorker(user, data.targetId);
      return changeRequestService.submit(i);
    },
  },
  decideChangeRequest: { method: "POST", access: ADMIN, handler: (i) => changeRequestService.decide(i) },
  assignTask: {
    method: "POST",
    access: PROJECT,
    projectScoped: true,
    handler: async (i, user) => {
      const workerId = z.object({ workerId: z.string().min(1) }).parse(i).workerId;
      await assertOwnWorker(user, workerId);
      return hrService.assignTask(i);
    },
  },
  setTaskStatus: {
    method: "POST",
    access: PROJECT,
    handler: async (i, user) => {
      const data = z.object({ id: z.string().min(1), status: z.enum(["todo", "in-progress", "done"]) }).parse(i);
      await assertOwnTask(user, data.id);
      return hrService.setTaskStatus(data.id, data.status);
    },
  },
  markAttendance: {
    method: "POST",
    access: PROJECT,
    handler: async (i, user) => {
      await assertOwnWorker(user, z.object({ workerId: z.string().min(1) }).parse(i).workerId);
      return hrService.markAttendance(i);
    },
  },
  addLead: { method: "POST", access: SALES, handler: (i) => salesService.addLead(i) },
  setLeadStatus: {
    method: "POST",
    access: SALES,
    handler: (i) => {
      const data = z.object({ id: z.string().min(1), status: leadStatusSchema }).parse(i);
      return salesService.setLeadStatus(data.id, data.status);
    },
  },
  recordSale: { method: "POST", access: SALES, handler: (i) => salesService.recordSale(i) },
};
