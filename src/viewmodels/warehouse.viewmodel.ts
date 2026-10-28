import "server-only";

import { cache } from "react";
import { addMonths } from "@/utils/date";
import { today } from "@/utils/id";
import { inventoryService, projectService } from "@/server/container";
import { orderEvents, sortEvents } from "@/utils/order-events";

/** How many of the newest delivered and rejected orders the pages show; the rest is under "View all records". */
export const HISTORY_LIMIT = 20;

/** The day that places a request in a month: when its last part arrived, when it was rejected or cancelled, when it was ordered, or when it was asked for. */
export const historyDate = (r: { status: string; receivedAt?: string; decidedAt?: string; orderedAt?: string; createdAt: string; deliveries?: { date: string }[] }) =>
  (r.status === "rejected" ? r.decidedAt : r.status === "ordered" ? r.orderedAt : (r.receivedAt ?? r.deliveries?.at(-1)?.date)) ?? r.createdAt;

/** Delivered and rejected orders, newest first. */
export const closedOrders = <T extends Parameters<typeof historyDate>[0]>(requests: (T & { status: string })[]) =>
  requests.filter((r) => r.status === "fulfilled" || r.status === "rejected").sort((a, b) => historyDate(b).localeCompare(historyDate(a)));

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
    history: closedOrders(requests).slice(0, HISTORY_LIMIT),
    historyTotal: closedOrders(requests).length,
  };
});

/**
 * Every request and order, month by month from the first project's start to now. An order appears in every month where
 * something happened to it: asked for, ordered, a part arrived, a payment was made, rejected. `month` ("2026-10") picks
 * one month's events; `projectSlug` limits everything to one project.
 */
export const getOrdersHistory = cache(async (month?: string, projectSlug?: string) => {
  const [requests, projects] = await Promise.all([inventoryService.listRequests(), projectService.list()]);
  const project = projects.find((p) => p.slug === projectSlug) ?? null;
  const events = sortEvents(requests.filter((r) => !project || r.projectId === project.id).flatMap(orderEvents));

  const thisMonth = today().slice(0, 7);
  const first = [...events.map((e) => e.date), ...(project ? [project.startDate] : projects.map((p) => p.startDate))]
    .map((d) => d.slice(0, 7))
    .sort()[0] ?? thisMonth;
  const months: { month: string; requested: number; ordered: number; deliveries: number; paid: number; rejected: number }[] = [];
  for (let key = first; key <= thisMonth; key = addMonths(`${key}-01`, 1).slice(0, 7)) {
    const own = events.filter((e) => e.date.startsWith(key));
    const count = (kind: string) => own.filter((e) => e.kind === kind).length;
    months.push({
      month: key,
      requested: count("requested"),
      ordered: count("ordered"),
      deliveries: count("delivered"),
      paid: own.filter((e) => e.kind === "paid").reduce((sum, e) => sum + (e.amount ?? 0), 0),
      rejected: count("rejected"),
    });
  }
  const selected = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
  return {
    projects,
    project,
    months: months.reverse(),
    selected,
    rows: selected ? events.filter((e) => e.date.startsWith(selected)) : [],
    all: events,
  };
});
