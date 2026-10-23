"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { phoneHref, whatsappNumber } from "@/utils/format";
import { apiRequest } from "@/utils/http-client";

type Channel = "call" | "whatsapp";

/** The value a datetime-local input needs for "now", in the agent's own time zone. */
const localNow = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

/**
 * The client's phone number as a button. Clicking it offers a WhatsApp message or a phone call; each one opens the app and is
 * counted. Right after, the agent can write what was discussed and, if the client asked to be contacted again, when.
 */
export function LeadContactMenu({ leadId, phone, defaultOpen = false }: { leadId: string; phone: string; defaultOpen?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [contact, setContact] = useState<{ id: string; channel: Channel } | null>(null);
  const [comment, setComment] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function count(channel: Channel) {
    setError(null);
    setSaved(false);
    setComment("");
    setFollowUp("");
    try {
      const logged = await apiRequest<{ id: string }>("logLeadContact", { leadId, channel });
      setContact({ id: logged.id, channel });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not count this contact");
    }
  }

  async function saveNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!contact) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest("saveContactNote", {
        contactId: contact.id,
        comment,
        followUpAt: followUp ? new Date(followUp).toISOString() : null,
      });
      setSaved(true);
      setContact(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the note");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="contact-menu" open={defaultOpen || undefined}>
      <summary className="contact-menu__phone">{phone}</summary>
      <div className="contact-menu__options">
        <a
          className="button button--small"
          href={`https://wa.me/${whatsappNumber(phone)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => void count("whatsapp")}
        >
          WhatsApp message
        </a>
        <a className="button button--ghost button--small" href={phoneHref(phone)} onClick={() => void count("call")}>
          Phone call
        </a>

        {contact ? (
          <form className="contact-note" onSubmit={saveNote}>
            <strong>{contact.channel === "call" ? "Call" : "WhatsApp"} counted. Add a note:</strong>
            <label className="field">
              <span className="field__label">What was discussed</span>
              <textarea rows={3} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} />
            </label>
            <label className="field">
              <span className="field__label">Follow up again on (optional)</span>
              <input type="datetime-local" min={localNow()} value={followUp} onChange={(event) => setFollowUp(event.target.value)} />
            </label>
            <button type="submit" className="button button--small" disabled={saving || (!comment.trim() && !followUp)}>
              {saving ? "Saving..." : "Save note"}
            </button>
          </form>
        ) : null}
        {saved ? <span className="form__success">Note saved.</span> : null}
      </div>
      {error ? <span className="form__error">{error}</span> : null}
    </details>
  );
}
