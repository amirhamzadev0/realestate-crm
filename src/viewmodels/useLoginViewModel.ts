"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiRequest } from "@/utils/http-client";

/** Client state for the sign-in form and the sign-out button. */
export function useLoginViewModel() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(email: string, password: string) {
    setBusy(true);
    setError(null);
    try {
      const { home } = await apiRequest<{ home: string }>("login", { email, password });
      router.replace(home);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await apiRequest("logout", {});
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return { signIn, signOut, busy, error };
}
