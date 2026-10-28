"use client";

import { useState } from "react";
import type { InstallmentView } from "@/models/finance";
import { localDate } from "@/utils/date";
import { formatDate, formatMoney, phoneHref, whatsappNumber } from "@/utils/format";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

const addDays = localDate;

/** The reminder the Finance manager can send on WhatsApp. */
function reminder(item: InstallmentView): string {
  const due = item.dueDate ? ` due on ${formatDate(item.dueDate)}` : "";
  return `Assalam o Alaikum ${item.buyer}, this is a reminder that your instalment of ${formatMoney(item.remaining)}${due} for unit ${item.unit} (${item.projectName}) is pending. Please pay it at your earliest. Thank you.`;
}

/**
 * What the Finance manager does with one instalment: take the payment in (all of it, or part), or follow the buyer up. A
 * follow-up is a call, a WhatsApp reminder or a note; they say when to follow up again (a few quick choices, or any day) and
 * the instalment leaves the "needs follow-up" list until then.
 */
export function InstallmentActions({ item }: { item: InstallmentView }) {
  const receive = useActionViewModel("receiveInstallment");
  const contact = useActionViewModel("logInstallmentContact");
  const move = useActionViewModel("rescheduleInstallment");
  const [newDate, setNewDate] = useState("");
  const [amount, setAmount] = useState("");
  const [channel, setChannel] = useState<"call" | "whatsapp" | "note">("call");
  const [comment, setComment] = useState("");
  const [followUpOn, setFollowUpOn] = useState("");
  const [open, setOpen] = useState(false);

  if (item.state === "paid") return <span className="muted">Paid {item.paidAt ? formatDate(item.paidAt) : ""}</span>;

  return (
    <div className="approval">
      <div className="inline-form">
        <input
          type="number"
          min={0}
          max={item.remaining}
          step="any"
          placeholder={`Received (${formatMoney(item.remaining)} owed)`}
          aria-label="Amount received"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <button
          type="button"
          className="button button--small"
          disabled={receive.busy}
          onClick={async () => {
            const ok = await receive.run({ installmentId: item.id, ...(amount !== "" ? { amount: Number(amount) } : {}) });
            if (ok) setAmount("");
          }}
        >
          {amount !== "" && Number(amount) < item.remaining ? "Receive part" : "Receive payment"}
        </button>
      </div>
      {receive.error ? <span className="form__error">{receive.error}</span> : null}

      <details className="contact-menu">
        <summary className="contact-menu__phone">Change date</summary>
        <div className="contact-menu__options">
          <label className="field">
            <span className="field__label">The buyer will pay on</span>
            <input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
          </label>
          <button
            type="button"
            className="button button--small"
            disabled={move.busy || !newDate}
            onClick={async () => {
              if (await move.run({ installmentId: item.id, dueDate: newDate })) setNewDate("");
            }}
          >
            Save the new date
          </button>
          {move.error ? <span className="form__error">{move.error}</span> : null}
        </div>
      </details>

      <details className="contact-menu" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="contact-menu__phone">Follow up{item.contacts.length ? ` (${item.contacts.length} so far)` : ""}</summary>
        <div className="contact-menu__options">
          {item.buyerPhone ? (
            <>
              <a
                className="button button--small"
                href={`https://wa.me/${whatsappNumber(item.buyerPhone)}?text=${encodeURIComponent(reminder(item))}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setChannel("whatsapp")}
              >
                Send reminder on WhatsApp
              </a>
              <a className="button button--ghost button--small" href={phoneHref(item.buyerPhone)} onClick={() => setChannel("call")}>
                Call {item.buyerPhone}
              </a>
            </>
          ) : null}
          <form
            className="contact-note"
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await contact.run({ installmentId: item.id, channel, comment, ...(followUpOn ? { followUpOn } : {}) });
              if (ok) {
                setComment("");
                setFollowUpOn("");
                setOpen(false);
              }
            }}
          >
            <label className="field">
              <span className="field__label">How did you follow up?</span>
              <select value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}>
                <option value="call">Phone call</option>
                <option value="whatsapp">WhatsApp message</option>
                <option value="note">Just a note</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">What the buyer said</span>
              <textarea rows={2} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Follow up again on (if the buyer asked for time)</span>
              <input type="date" min={addDays(0)} value={followUpOn} onChange={(event) => setFollowUpOn(event.target.value)} />
            </label>
            <div className="row-actions">
              {[2, 5, 7, 10].map((days) => (
                <button key={days} type="button" className="button button--ghost button--small" onClick={() => setFollowUpOn(addDays(days))}>
                  +{days} days
                </button>
              ))}
            </div>
            <button type="submit" className="button button--small" disabled={contact.busy}>
              {contact.busy ? "Saving..." : "Mark as followed up"}
            </button>
            {contact.error ? <span className="form__error">{contact.error}</span> : null}
          </form>
        </div>
      </details>
    </div>
  );
}
