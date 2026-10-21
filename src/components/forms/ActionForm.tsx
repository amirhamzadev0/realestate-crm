"use client";

import { useRef, useState } from "react";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

export interface FieldSpec {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea";
  required?: boolean;
  options?: { value: string; label: string }[];
  defaultValue?: string;
  /** Empty select value is sent as null instead of being left out. */
  nullable?: boolean;
  step?: string;
  /** Replaces the label by the current value of another field (for example a different unit per project type). */
  labelWhen?: { field: string; labels: Record<string, string> };
  /** Shows the field only while another field has one of these values. A hidden field is not sent. */
  showWhen?: { field: string; values: string[] };
}

export function ActionForm({
  operation,
  fields,
  hidden,
  payloadKey,
  successMessage,
  submitLabel,
}: {
  operation: string;
  fields: FieldSpec[];
  hidden?: Record<string, unknown>;
  /** When set, field values are nested under this key instead of the top level. */
  payloadKey?: string;
  successMessage?: string;
  submitLabel: string;
}) {
  const { run, busy, error } = useActionViewModel(operation);
  const formRef = useRef<HTMLFormElement>(null);
  const [sent, setSent] = useState(false);
  // Current values of the fields other fields depend on.
  const watched = new Set(fields.flatMap((f) => [f.labelWhen?.field, f.showWhen?.field]).filter((n): n is string => !!n));
  const initialValues = () =>
    Object.fromEntries(fields.filter((f) => watched.has(f.name)).map((f) => [f.name, f.defaultValue ?? f.options?.[0]?.value ?? ""]));
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  const visible = (field: FieldSpec) => !field.showWhen || field.showWhen.values.includes(values[field.showWhen.field] ?? "");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const sentValues: Record<string, unknown> = {};
    for (const field of fields) {
      if (!visible(field)) continue;
      const raw = String(data.get(field.name) ?? "").trim();
      if (raw === "") {
        if (field.nullable) sentValues[field.name] = null;
        continue;
      }
      sentValues[field.name] = field.type === "number" ? Number(raw) : raw;
    }
    const body = payloadKey ? { ...hidden, [payloadKey]: sentValues } : { ...hidden, ...sentValues };
    const ok = await run(body);
    setSent(ok);
    if (ok) {
      formRef.current?.reset();
      setValues(initialValues());
    }
  }

  function onChange(event: React.ChangeEvent<HTMLFormElement>) {
    const { name, value } = event.target as unknown as HTMLInputElement;
    if (watched.has(name)) setValues((current) => ({ ...current, [name]: value }));
  }

  return (
    <form ref={formRef} className="form" onSubmit={onSubmit} onChange={onChange}>
      <div className="form__grid">
        {fields.filter(visible).map((field) => (
          <label key={field.name} className="field">
            <span className="field__label">
              {field.labelWhen ? (field.labelWhen.labels[values[field.labelWhen.field] ?? ""] ?? field.label) : field.label}
            </span>
            {field.type === "select" ? (
              <select name={field.name} required={field.required} defaultValue={field.defaultValue ?? ""}>
                {field.required ? null : <option value="">None</option>}
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === "textarea" ? (
              <textarea name={field.name} required={field.required} defaultValue={field.defaultValue} rows={2} />
            ) : (
              <input
                name={field.name}
                type={field.type}
                required={field.required}
                defaultValue={field.defaultValue}
                min={field.type === "number" ? 0 : undefined}
                step={field.type === "number" ? (field.step ?? "any") : undefined}
              />
            )}
          </label>
        ))}
      </div>
      {error ? (
        <p className="form__error" role="alert">
          {error}
        </p>
      ) : null}
      {sent && !error && successMessage ? <p className="form__success">{successMessage}</p> : null}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
