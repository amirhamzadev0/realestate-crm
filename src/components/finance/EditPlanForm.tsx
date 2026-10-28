"use client";

import { useState } from "react";
import { formatMoney } from "@/utils/format";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/**
 * Changes the plan of a unit that is still booked: a longer or shorter plan (what is still owed is spread again over the new
 * months, payments already made stay) and/or another day of the month for the instalments. Shows what the new instalment will be.
 */
export function EditPlanForm({
  saleId,
  months,
  dueDay,
  keptCount,
  pool,
}: {
  saleId: string;
  months: number; // monthly instalments in the plan now
  dueDay: number; // the day of the month they fall due now
  keptCount: number; // monthly instalments that already have a payment (they stay as they are)
  pool: number; // what is owed on the monthly instalments that have no payment yet
}) {
  const { run, busy, error } = useActionViewModel("editInstallmentPlan");
  const [years, setYears] = useState(String(months / 12));
  const [day, setDay] = useState(String(dueDay));
  const [done, setDone] = useState(false);

  const newMonths = Math.round(Number(years) * 12);
  const left = newMonths - keptCount;
  const changed = newMonths !== months || Number(day) !== dueDay;
  const tooShort = left < 1;

  return (
    <form
      className="form"
      onSubmit={async (event) => {
        event.preventDefault();
        const ok = await run({
          saleId,
          ...(newMonths !== months ? { months: newMonths } : {}),
          ...(Number(day) !== dueDay ? { dueDay: Number(day) } : {}),
        });
        setDone(ok);
      }}
    >
      <p className="muted">
        Now: {months} monthly instalments (about {formatMoney(Math.round(pool / Math.max(1, months - keptCount)))} each), due on the {dueDay} of each month.{" "}
        {keptCount} already have a payment and stay as they are.
      </p>
      <div className="form__grid">
        <label className="field">
          <span className="field__label">New plan length (years)</span>
          <input type="number" min={0.25} max={30} step="any" required value={years} onChange={(event) => setYears(event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">New due day (1-28)</span>
          <input type="number" min={1} max={28} step="1" required value={day} onChange={(event) => setDay(event.target.value)} />
        </label>
      </div>
      {changed && !tooShort ? (
        <div className="price-preview" aria-live="polite">
          <span>
            {formatMoney(pool)} still owed on the monthly instalments will be spread over {left} months
          </span>
          <strong>About {formatMoney(Math.floor(pool / left))} a month, due on the {day} of each month</strong>
        </div>
      ) : null}
      {tooShort ? <p className="form__error">{keptCount} instalments already have payments, so the plan cannot be that short.</p> : null}
      {error ? (
        <p className="form__error" role="alert">
          {error}
        </p>
      ) : null}
      {done && !error ? <p className="form__success">The plan was changed.</p> : null}
      <button type="submit" className="button" disabled={busy || !changed || tooShort}>
        {busy ? "Saving..." : "Save the new plan"}
      </button>
    </form>
  );
}
