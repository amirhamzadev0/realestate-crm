"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apiRequest } from "@/utils/http-client";

/** Client state for any POST operation: busy flag, error message, and a refresh of the server data after success. */
export function useActionViewModel(operation: string) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(body: Record<string, unknown>): Promise<boolean> {
    setSending(true);
    setError(null);
    try {
      await apiRequest(operation, body);
      startTransition(() => router.refresh());
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
      return false;
    } finally {
      setSending(false);
    }
  }

  return { run, busy: sending || refreshing, error };
}
