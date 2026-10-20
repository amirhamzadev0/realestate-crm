"use client";

import { useLoginViewModel } from "@/viewmodels/useLoginViewModel";

export function LogoutButton() {
  const { signOut, busy } = useLoginViewModel();
  return (
    <button type="button" className="sidebar__signout" onClick={() => void signOut()} disabled={busy}>
      Sign out
    </button>
  );
}
