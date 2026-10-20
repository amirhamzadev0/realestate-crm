/** Browser-side call to the /api/[operation] dispatcher. Returns `data` or throws with the server message. */
export async function apiRequest<T>(operation: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`/api/${operation}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!response.ok || !payload || payload.data === undefined) {
    throw new Error(payload?.error ?? `Request failed (${response.status})`);
  }
  return payload.data;
}
