"use client";

import { useState } from "react";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/**
 * Controls for one order that has not arrived: mark it delivered (the material goes into the project inventory),
 * or, for the Super Admin, cancel it with a reason.
 */
export function DeliveryActions({ requestId, canCancel }: { requestId: string; canCancel: boolean }) {
  const receive = useActionViewModel("receiveMaterial");
  const cancel = useActionViewModel("rejectMaterialRequest");
  const [note, setNote] = useState("");
  const busy = receive.busy || cancel.busy;
  const error = receive.error ?? cancel.error;

  return (
    <div className="approval">
      {canCancel ? (
        <input
          type="text"
          placeholder="Reason if cancelling"
          aria-label="Cancellation reason"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
      ) : null}
      <button type="button" className="button button--small" disabled={busy} onClick={() => void receive.run({ requestId })}>
        Mark delivered
      </button>
      {canCancel ? (
        <button
          type="button"
          className="button button--danger button--small"
          disabled={busy}
          onClick={() => void cancel.run({ requestId, note })}
        >
          Cancel order
        </button>
      ) : null}
      {error ? <span className="form__error">{error}</span> : null}
    </div>
  );
}
