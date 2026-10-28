import type { Lead } from "@/models/sales";

/** A lead that is still being worked on: neither sold (won) nor given up (lost). */
export const isOpenLead = (lead: Pick<Lead, "status">) => lead.status !== "won" && lead.status !== "lost";

/**
 * A lead that has no agent working on it: it was never forwarded, or its agent was removed since. Such a lead must show as "not
 * forwarded" and be shared again, so a lead is never stuck with someone who can no longer see it.
 */
export const isUnforwarded = (lead: Pick<Lead, "agentId" | "status">, activeAgentIds: Set<string>) =>
  lead.agentId === null || (isOpenLead(lead) && !activeAgentIds.has(lead.agentId));
