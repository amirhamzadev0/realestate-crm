"use client";

import { useState } from "react";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/** Warehouse controls for one open request: issue it from stock, or reject it with a reason. */
export function IssueActions({ requestId }: { requestId: string }) {
  const issue = useActionViewModel("fulfillMaterialRequest");
  const reject = useActionViewModel("rejectMaterialRequest");
  const [note, setNote] = useState("");
  const busy = issue.busy || reject.busy;
  const error = issue.error ?? reject.error;

  return (
    <div className="approval">
      <input
        type="text"
        placeholder="Reason if rejecting"
        aria-label="Rejection reason"
        value={note}
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
      />
      <button type="button" className="button button--small" disabled={busy} onClick={() => void issue.run({ requestId })}>
        Issue
      </button>
      <button
        type="button"
        className="button button--danger button--small"
        disabled={busy}
        onClick={() => void reject.run({ requestId, note })}
      >
        Reject
      </button>
      {error ? <span className="form__error">{error}</span> : null}
    </div>
  );
}
