"use client";

import { useState } from "react";
import type { ManagerView } from "@/models/manager";
import { useActionViewModel } from "@/viewmodels/useActionViewModel";

/**
 * Deletes a manager. One who runs a project must first be replaced: pick another manager who has no project, or create a
 * new one right here. The new manager is assigned to the project and then the old one is deleted.
 */
export function ManagerRemover({ manager, freeManagers }: { manager: ManagerView; freeManagers: ManagerView[] }) {
  const { run, busy, error } = useActionViewModel("deleteManager");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">(freeManagers.length ? "existing" : "new");
  const [replacementId, setReplacementId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  if (!manager.projectId) {
    return (
      <span className="action-button">
        <button
          type="button"
          className="button button--danger button--small"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Delete ${manager.name}?`)) void run({ id: manager.id });
          }}
        >
          {busy ? "..." : "Delete"}
        </button>
        {error ? <span className="form__error">{error}</span> : null}
      </span>
    );
  }

  const ready = mode === "existing" ? replacementId !== "" : name.trim() !== "";

  return (
    <>
      <button type="button" className="button button--danger button--small" onClick={() => setOpen(!open)}>
        {open ? "Cancel" : "Delete"}
      </button>
      {open ? (
        <div className="review">
          <strong>
            {manager.name} runs {manager.projectName}. Give the project a new manager first; then {manager.name} is deleted.
          </strong>
          <label className="field">
            <span className="field__label">New manager</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as "existing" | "new")}>
              {freeManagers.length ? <option value="existing">Pick an existing manager</option> : null}
              <option value="new">Create a new manager</option>
            </select>
          </label>
          {mode === "existing" ? (
            <label className="field">
              <span className="field__label">Manager who takes over</span>
              <select value={replacementId} onChange={(event) => setReplacementId(event.target.value)}>
                <option value="">Choose...</option>
                {freeManagers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="form__grid">
              <label className="field">
                <span className="field__label">Name</span>
                <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">Phone</span>
                <input type="text" value={phone} onChange={(event) => setPhone(event.target.value)} />
              </label>
              <label className="field">
                <span className="field__label">Email</span>
                <input type="text" value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
            </div>
          )}
          <button
            type="button"
            className="button button--danger button--small"
            disabled={busy || !ready}
            onClick={() => {
              const next = mode === "existing" ? { replacementId } : { replacement: { name: name.trim(), phone: phone.trim(), email: email.trim() } };
              if (window.confirm(`Assign the new manager to ${manager.projectName} and delete ${manager.name}?`)) void run({ id: manager.id, ...next });
            }}
          >
            {busy ? "Saving..." : `Assign and delete ${manager.name}`}
          </button>
          {error ? (
            <span className="form__error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
