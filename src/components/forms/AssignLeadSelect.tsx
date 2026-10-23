"use client";

import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/** Forwards one lead to the chosen agent. Choosing "Not assigned" takes it back. The agent sees it in their portal. */
export function AssignLeadSelect({
  leadId,
  agentId,
  agents,
}: {
  leadId: string;
  agentId: string | null;
  agents: { id: string; name: string }[];
}) {
  const { run, busy, error } = useActionViewModel("assignLead");

  return (
    <span>
      <select
        className="select--inline"
        value={agentId ?? ""}
        disabled={busy}
        aria-label="Forward to agent"
        onChange={(event) => void run({ leadId, agentId: event.target.value || null })}
      >
        <option value="">Not assigned</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
      {error ? <span className="form__error">{error}</span> : null}
    </span>
  );
}
