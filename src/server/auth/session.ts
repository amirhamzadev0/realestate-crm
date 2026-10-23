import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { authEnabled } from "@/config/auth";
import type { AuthUser } from "@/models/auth";
import type { Role } from "@/models/site";
import { authService } from "@/server/container";
import { SESSION_COOKIE } from "@/services/auth.service";

/** Stands in for the signed-in person while AUTH_ENABLED is off. The Super Admin may open every portal. */
const OPEN_ACCESS_USER: AuthUser = { id: "open-access", email: "", name: "Demo user", role: "superadmin", projectId: null, agentId: null };

export const getSessionToken = async () => (await cookies()).get(SESSION_COOKIE)?.value;

/** The signed-in user for this request, or null. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  if (!authEnabled) return OPEN_ACCESS_USER;
  return authService.current(await getSessionToken());
});

/** Page guard: signed out goes to /login, the wrong role goes back to its own home. */
export async function requireRole(allowed: Role[]): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!allowed.includes(user.role)) redirect(await authService.homeFor(user));
  return user;
}
