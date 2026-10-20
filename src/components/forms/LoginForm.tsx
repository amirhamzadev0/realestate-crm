"use client";

import { useLoginViewModel } from "@/viewmodels/useLoginViewModel";

export function LoginForm() {
  const { signIn, busy, error } = useLoginViewModel();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void signIn(String(data.get("email") ?? ""), String(data.get("password") ?? ""));
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label className="field">
        <span className="field__label">Email</span>
        <input name="email" type="email" required autoComplete="username" />
      </label>
      <label className="field">
        <span className="field__label">Password</span>
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      {error ? (
        <p className="form__error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="button" disabled={busy}>
        {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
