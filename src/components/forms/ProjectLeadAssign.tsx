"use client";

import { useState } from "react";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/** "Give every lead of this project to this agent": one agent for the whole project. */
export function ProjectLeadAssign({
  projectId,
  projectName,
  unassigned,
  open,
  agents,
}: {
  projectId: string;
  projectName: string;
  unassigned: number; // leads of the project nobody has yet
  open: number; // leads of the project that are not won or lost
  agents: { id: string; name: string }[];
}) {
  const { run, busy, error } = useActionViewModel("assignProjectLeads");
  const [agentId, setAgentId] = useState("");
  const [includeAssigned, setIncludeAssigned] = useState(false);
  const count = includeAssigned ? open : unassigned;

  return (
    <div className="approval">
      <div className="inline-form">
        <select className="select--inline" value={agentId} onChange={(event) => setAgentId(event.target.value)} aria-label={`Agent for ${projectName}`}>
          <option value="">Choose an agent</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="button button--small"
          disabled={busy || !agentId || count === 0}
          onClick={() => {
            const who = agents.find((a) => a.id === agentId)?.name ?? "this agent";
            if (window.confirm(`Give ${count} leads of ${projectName} to ${who}?`)) void run({ projectId, agentId, includeAssigned });
          }}
        >
          {busy ? "..." : `Give ${count} to the agent`}
        </button>
      </div>
      <label className="muted">
        <input type="checkbox" checked={includeAssigned} onChange={(event) => setIncludeAssigned(event.target.checked)} /> Also take the leads already given to other agents
      </label>
      {error ? <span className="form__error">{error}</span> : null}
    </div>
  );
}
