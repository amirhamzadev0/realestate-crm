import type { ReactNode } from "react";

export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {title ? (
        <header className="card__header">
          <h2 className="card__title">{title}</h2>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
  hint?: string;
}) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <strong className={`stat-card__value stat-card__value--${tone}`}>{value}</strong>
      {hint ? <span className="stat-card__hint">{hint}</span> : null}
    </div>
  );
}
