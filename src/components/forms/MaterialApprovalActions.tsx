"use client";

import { useState } from "react";
import { today } from "@/utils/id";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/**
 * Super Admin controls for one pending material request. Rejecting needs nothing more; approving places the order, so it
 * asks for the vendor, the amount, the order date and how it is paid (an advance now, or everything on delivery).
 */
export function MaterialApprovalActions({ requestId }: { requestId: string }) {
  const { run, busy, error } = useActionViewModel("decideMaterialRequest");
  const [note, setNote] = useState("");
  const [ordering, setOrdering] = useState(false);
  const [terms, setTerms] = useState<"advance" | "on-delivery">("on-delivery");

  async function placeOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await run({
      requestId,
      decision: "approved",
      note,
      vendor: String(data.get("vendor") ?? "").trim(),
      totalAmount: Number(data.get("totalAmount")),
      orderDate: String(data.get("orderDate") ?? ""),
      paymentTerms: terms,
      ...(terms === "advance" ? { advanceAmount: Number(data.get("advanceAmount")) } : {}),
    });
  }

  return (
    <div className="approval approval--stack">
      <input
        type="text"
        placeholder="Note (optional)"
        aria-label="Decision note"
        value={note}
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
      />
      {ordering ? (
        <form className="order-details" onSubmit={placeOrder}>
          <label className="field">
            <span className="field__label">Vendor</span>
            <input name="vendor" type="text" required maxLength={120} />
          </label>
          <label className="field">
            <span className="field__label">Order amount (PKR)</span>
            <input name="totalAmount" type="number" min={1} step="any" required />
          </label>
          <label className="field">
            <span className="field__label">Order date</span>
            <input name="orderDate" type="date" required defaultValue={today()} max={today()} />
          </label>
          <label className="field">
            <span className="field__label">Payment</span>
            <select value={terms} onChange={(event) => setTerms(event.target.value as "advance" | "on-delivery")}>
              <option value="on-delivery">Pay on delivery</option>
              <option value="advance">Advance now, rest on delivery</option>
            </select>
          </label>
          {terms === "advance" ? (
            <label className="field">
              <span className="field__label">Advance paid now (PKR)</span>
              <input name="advanceAmount" type="number" min={1} step="any" required />
            </label>
          ) : null}
          <div className="row-actions">
            <button type="submit" className="button button--small" disabled={busy}>
              Place order
            </button>
            <button type="button" className="button button--ghost button--small" disabled={busy} onClick={() => setOrdering(false)}>
              Back
            </button>
          </div>
        </form>
      ) : (
        <div className="row-actions">
          <button type="button" className="button button--small" disabled={busy} onClick={() => setOrdering(true)}>
            Approve and order
          </button>
          <button
            type="button"
            className="button button--danger button--small"
            disabled={busy}
            onClick={() => void run({ requestId, decision: "rejected", note })}
          >
            Reject
          </button>
        </div>
      )}
      {error ? <span className="form__error">{error}</span> : null}
    </div>
  );
}
