"use client";

import Link from "next/link";
import { ActionButton } from "@/components/forms/ActionButton";
import { LeadContactMenu } from "@/components/forms/LeadContactMenu";
import { useNow } from "@/components/layout/NotificationsContext";
import { LocalTime } from "@/components/sales/LocalTime";

export interface FollowUpItem {
  contactId: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  projectName: string;
  at: string; // ISO, UTC
  comment: string;
}

/** "in 2 hours", "overdue by 1 day"... */
function relative(at: string, now: number): string {
  const minutes = Math.round((new Date(at).getTime() - now) / 60_000);
  const span = Math.abs(minutes);
  const text = span < 60 ? `${span} min` : span < 60 * 24 ? `${Math.round(span / 60)} hours` : `${Math.round(span / 1440)} days`;
  return minutes <= 0 ? `due ${span < 1 ? "now" : `${text} ago`}` : `in ${text}`;
}

/** A banner at the top of every agent page: follow-ups that are due now, or the next one coming up. */
export function FollowUpAlert({ items, href, dueHref }: { items: FollowUpItem[]; href: string; dueHref: string }) {
  const now = useNow();
  const due = items.filter((item) => new Date(item.at).getTime() <= now);
  const next = items.find((item) => new Date(item.at).getTime() > now);

  if (due.length > 0) {
    return (
      <section className="notice notice--danger no-print" role="alert">
        <strong>{due.length === 1 ? "1 follow-up is due" : `${due.length} follow-ups are due`} now:</strong>{" "}
        {due.slice(0, 3).map((item, index) => (
          <span key={item.contactId}>
            {index > 0 ? ", " : ""}
            <Link href={`${dueHref.split("?")[0]}?lead=${item.leadId}`} className="link">
              {item.leadName}
            </Link>
          </span>
        ))}
        {due.length > 3 ? ` and ${due.length - 3} more` : ""}.{" "}
        <Link href={dueHref} className="link">
          Open my leads
        </Link>
      </section>
    );
  }
  if (next && new Date(next.at).getTime() - now < 24 * 60 * 60_000) {
    return (
      <section className="notice notice--warning no-print" role="status">
        Next follow-up: <strong>{next.leadName}</strong> at <LocalTime iso={next.at} /> ({relative(next.at, now)}).{" "}
        <Link href={href} className="link">
          All follow-ups
        </Link>
      </section>
    );
  }
  return null;
}

/** The upcoming follow-ups: the ones whose time has come first, then the nearest ones, then the rest. */
export function FollowUpList({ items }: { items: FollowUpItem[] }) {
  const now = useNow();
  const sorted = [...items].sort((a, b) => a.at.localeCompare(b.at));
  const due = sorted.filter((item) => new Date(item.at).getTime() <= now);
  const upcoming = sorted.filter((item) => new Date(item.at).getTime() > now);

  const row = (item: FollowUpItem, isDue: boolean) => (
    <li key={item.contactId} className={`follow-up${isDue ? " follow-up--due" : ""}`}>
      <div className="follow-up__when">
        <strong>
          <LocalTime iso={item.at} />
        </strong>
        <span className={isDue ? "follow-up__badge follow-up__badge--due" : "muted"}>{relative(item.at, now)}</span>
      </div>
      <div className="follow-up__who">
        <strong>{item.leadName}</strong>
        <div className="muted">{item.projectName}</div>
        {item.comment ? <div className="follow-up__comment">&ldquo;{item.comment}&rdquo;</div> : null}
      </div>
      <div className="follow-up__actions">
        <LeadContactMenu leadId={item.leadId} phone={item.leadPhone} />
        <ActionButton operation="completeFollowUp" body={{ contactId: item.contactId }} label="Done" variant="ghost" />
      </div>
    </li>
  );

  if (items.length === 0) return <p className="empty-state">No follow-up is waiting. When a client asks to be contacted again, add the date after the call.</p>;
  return (
    <div className="follow-ups">
      {due.length > 0 ? (
        <>
          <h3 className="form__subtitle">Due now ({due.length})</h3>
          <ul className="follow-up-list">{due.map((item) => row(item, true))}</ul>
        </>
      ) : null}
      {upcoming.length > 0 ? (
        <>
          <h3 className="form__subtitle">Upcoming ({upcoming.length}), nearest first</h3>
          <ul className="follow-up-list">{upcoming.map((item) => row(item, false))}</ul>
        </>
      ) : null}
    </div>
  );
}
