"use client";

import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/** Inline dropdown that posts `{ id, status }` when changed (lead stage, task status). */
export function StatusSelect({
  operation,
  id,
  value,
  options,
}: {
  operation: string;
  id: string;
  value: string;
  options: string[];
}) {
  const { run, busy, error } = useActionViewModel(operation);

  return (
    <span>
      <select
        className="select--inline"
        value={value}
        disabled={busy}
        aria-label="Status"
        onChange={(event) => void run({ id, status: event.target.value })}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace("-", " ")}
          </option>
        ))}
      </select>
      {error ? <span className="form__error">{error}</span> : null}
    </span>
  );
}
