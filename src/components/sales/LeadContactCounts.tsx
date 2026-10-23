import { LocalTime } from "@/components/sales/LocalTime";
import type { LeadContactSummary } from "@/models/sales";
import { formatDate } from "@/utils/format";

/**
 * "Calls 2 - WhatsApp 1 - last 21 Oct 2026", the last note and the next follow-up, or "Not contacted yet".
 */
export function LeadContactCounts({ contacts }: { contacts?: LeadContactSummary }) {
  if (!contacts || (contacts.calls === 0 && contacts.whatsapp === 0)) return <span className="muted">Not contacted yet</span>;
  return (
    <span>
      Calls <strong>{contacts.calls}</strong> - WhatsApp <strong>{contacts.whatsapp}</strong>
      {contacts.lastAt ? <div className="muted">last {formatDate(contacts.lastAt.slice(0, 10))}</div> : null}
      {contacts.lastComment ? <div className="contact-comment">&ldquo;{contacts.lastComment}&rdquo;</div> : null}
      {contacts.nextFollowUpAt ? (
        <div>
          <span className="follow-up__badge">Follow up: <LocalTime iso={contacts.nextFollowUpAt} /></span>
        </div>
      ) : null}
    </span>
  );
}
