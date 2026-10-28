"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/utils/http-client";

interface ShareResult {
  assigned: number;
  perAgent: { agentId: string; agentName: string; count: number }[];
}

/**
 * Shares the leads that have no agent yet equally, one after the other, so everyone gets the same number (or one more).
 * It can be every project or one project, and every agent or only the ones ticked. Shows how many each agent received.
 */
export function ShareLeadsEqually({
  projects,
  agents,
}: {
  projects: { id: string; name: string; unassigned: number }[];
  agents: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShareResult | null>(null);
  const [projectId, setProjectId] = useState("");
  const [picked, setPicked] = useState<string[]>(agents.map((a) => a.id));

  const unassigned = projectId ? (projects.find((p) => p.id === projectId)?.unassigned ?? 0) : projects.reduce((sum, p) => sum + p.unassigned, 0);
  const chosen = agents.filter((a) => picked.includes(a.id));

  async function share() {
    const where = projectId ? ` of ${projects.find((p) => p.id === projectId)?.name}` : "";
    if (!window.confirm(`Divide ${unassigned} leads${where} equally among ${chosen.length} agents?`)) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await apiRequest<ShareResult>("assignLeadsEqually", { ...(projectId ? { projectId } : {}), agentIds: chosen.map((a) => a.id) }));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="share-leads">
      <div className="inline-form">
        <label className="field">
          <span className="field__label">Which leads</span>
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.unassigned} not forwarded)
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="unit-group">
        <legend>Share among these agents</legend>
        {agents.map((a) => (
          <label key={a.id} className="muted" style={{ marginRight: "1rem" }}>
            <input
              type="checkbox"
              checked={picked.includes(a.id)}
              onChange={(event) => setPicked((current) => (event.target.checked ? [...current, a.id] : current.filter((id) => id !== a.id)))}
            />{" "}
            {a.name}
          </label>
        ))}
      </fieldset>
      <p>
        <strong>{unassigned}</strong> leads are not forwarded to an agent yet. <strong>{chosen.length}</strong> agents will share them.
      </p>
      <button type="button" className="button" disabled={busy || unassigned === 0 || chosen.length === 0} onClick={() => void share()}>
        {busy ? "Dividing..." : "Divide equally among the agents"}
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
