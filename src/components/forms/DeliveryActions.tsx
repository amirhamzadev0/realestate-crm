"use client";

import { useState } from "react";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/**
 * Controls for one order that has not fully arrived: say how much arrived (it goes into the project inventory; leave it
 * empty when everything that is still to come arrived), or, for the Super Admin, cancel the order with a reason.
 */
export function DeliveryActions({ requestId, canCancel, remaining, unit }: { requestId: string; canCancel: boolean; remaining: number; unit: string }) {
  const receive = useActionViewModel("receiveMaterial");
  const cancel = useActionViewModel("rejectMaterialRequest");
  const [note, setNote] = useState("");
  const [quantity, setQuantity] = useState("");
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
      <input
        type="number"
        min={0}
        max={remaining}
        step="any"
        placeholder={`Arrived (${remaining} ${unit} left)`}
        aria-label="Quantity that arrived"
        value={quantity}
        onChange={(event) => setQuantity(event.target.value)}
      />
      <button
        type="button"
        className="button button--small"
        disabled={busy}
        onClick={async () => {
          const ok = await receive.run({ requestId, ...(quantity !== "" ? { quantity: Number(quantity) } : {}) });
          if (ok) setQuantity("");
        }}
      >
        {quantity !== "" && Number(quantity) < remaining ? "Mark part received" : "Mark received"}
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
