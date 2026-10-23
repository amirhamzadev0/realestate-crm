"use client";

import { useState } from "react";
import { apiRequest } from "@/utils/http-client";
import { useRouter } from "next/navigation";

interface ShareResult {
  assigned: number;
  perAgent: { agentId: string; agentName: string; count: number }[];
}

/**
 * Shares every lead that has no agent yet equally among all active agents, so a long list does not have to be forwarded
 * one by one. Shows how many each agent received.
 */
export function ShareLeadsEqually({ unassigned, agentCount }: { unassigned: number; agentCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareResult | null>(null);

  async function share() {
    if (!window.confirm(`Divide ${unassigned} leads equally among ${agentCount} agents?`)) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await apiRequest<ShareResult>("assignLeadsEqually", {}));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-leads">
      <p>
        <strong>{unassigned}</strong> leads are not forwarded to an agent yet. <strong>{agentCount}</strong> agents can take them.
      </p>
      <button type="button" className="button" disabled={busy || unassigned === 0 || agentCount === 0} onClick={() => void share()}>
        {busy ? "Dividing..." : "Divide all equally among the agents"}
      </button>
      {error ? (
        <p className="form__error" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <p className="form__success">
          {result.assigned} leads divided: {result.perAgent.map((a) => `${a.agentName} ${a.count}`).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}
