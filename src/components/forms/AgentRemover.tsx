"use client";

import { useState } from "react";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/**
 * Removes an agent. If they still have open leads (not sold and not lost) the manager first chooses what happens to them: give
 * them to another agent, or put them back in "Not forwarded" so they can be shared again. No lead is ever left with a removed agent.
 */
export function AgentRemover({
  agent,
  openLeads,
  otherAgents,
}: {
  agent: { id: string; name: string };
  openLeads: number;
  otherAgents: { id: string; name: string }[];
}) {
  const { run, busy, error } = useActionViewModel("removeAgent");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"transfer" | "pool">(otherAgents.length ? "transfer" : "pool");
  const [toAgentId, setToAgentId] = useState("");

  if (openLeads === 0) {
    return (
      <span className="action-button">
        <button
          type="button"
          className="button button--danger button--small"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Remove ${agent.name}? Their past sales and commission stay in the reports.`)) void run({ id: agent.id });
          }}
        >
          {busy ? "..." : "Remove"}
        </button>
        {error ? <span className="form__error">{error}</span> : null}
      </span>
    );
  }

  const ready = mode === "pool" || toAgentId !== "";
  const target = otherAgents.find((a) => a.id === toAgentId)?.name;

  return (
    <>
      <button type="button" className="button button--danger button--small" onClick={() => setOpen(!open)}>
        {open ? "Cancel" : "Remove"}
      </button>
      {open ? (
        <div className="review">
          <strong>
            {agent.name} has {openLeads} open {openLeads === 1 ? "lead" : "leads"}. What should happen to them?
          </strong>
          <label className="field">
            <span className="field__label">His open leads</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as "transfer" | "pool")}>
              {otherAgents.length ? <option value="transfer">Give them to another agent</option> : null}
              <option value="pool">Put them back in "Not forwarded" (share them later)</option>
            </select>
          </label>
          {mode === "transfer" ? (
            <label className="field">
              <span className="field__label">Agent who takes the leads</span>
              <select value={toAgentId} onChange={(event) => setToAgentId(event.target.value)}>
                <option value="">Choose...</option>
                {otherAgents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="muted">Leads that are already sold or lost, and his past sales and commission, stay as they are in the reports.</p>
          <button
            type="button"
            className="button button--danger button--small"
            disabled={busy || !ready}
            onClick={() => {
              const what = mode === "transfer" ? `give his ${openLeads} leads to ${target}` : `put his ${openLeads} leads back in "Not forwarded"`;
              if (window.confirm(`Remove ${agent.name} and ${what}?`)) void run({ id: agent.id, leads: mode, ...(mode === "transfer" ? { toAgentId } : {}) });
            }}
          >
            {busy ? "Saving..." : mode === "transfer" ? `Move the leads and remove ${agent.name}` : `Free the leads and remove ${agent.name}`}
          </button>
          {error ? (
            <span className="form__error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
