import "server-only";

import type { NextRequest } from "next/server";

/** POST requests must come from the configured app origin. */
export function isAllowedOrigin(request: NextRequest): boolean {
  const expected = process.env.APP_ORIGIN;
  if (!expected) return false;
  return request.headers.get("origin") === expected;
}
