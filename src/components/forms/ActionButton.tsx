"use client";

import { useActionViewModel } from "@/viewmodels/useActionViewModel";

export function ActionButton({
  operation,
  body,
  label,
  variant = "primary",
  confirm,
}: {
  operation: string;
  body: Record<string, unknown>;
  label: string;
  variant?: "primary" | "danger" | "ghost";
  confirm?: string;
}) {
  const { run, busy, error } = useActionViewModel(operation);

  return (
    <span className="action-button">
      <button
        type="button"
        className={`button button--${variant} button--small`}
        disabled={busy}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          void run(body);
        }}
      >
        {busy ? "..." : label}
      </button>
      {error ? (
        <span className="form__error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
