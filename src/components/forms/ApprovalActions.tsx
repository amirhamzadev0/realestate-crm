"use client";

import { useState } from "react";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/** Super admin approve / reject controls for one pending material request. */
export function ApprovalActions({
  requestId,
  operation = "decideMaterialRequest",
}: {
  requestId: string;
  operation?: "decideMaterialRequest" | "decideChangeRequest";
}) {
  const { run, busy, error } = useActionViewModel(operation);
  const [note, setNote] = useState("");

  return (
    <div className="approval">
      <input
        type="text"
        placeholder="Note (optional)"
        aria-label="Decision note"
        value={note}
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
      />
      <button
        type="button"
        className="button button--small"
        disabled={busy}
        onClick={() => void run({ requestId, decision: "approved", note })}
      >
        Approve
      </button>
      <button
        type="button"
        className="button button--danger button--small"
        disabled={busy}
        onClick={() => void run({ requestId, decision: "rejected", note })}
      >
        Reject
      </button>
      {error ? <span className="form__error">{error}</span> : null}
    </div>
  );
}
