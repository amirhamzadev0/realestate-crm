import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { UserCredential } from "@/models/auth";

const fileSchema = z.array(
  z.object({
    id: z.string().min(1),
    email: z.string().email(),
    name: z.string().min(1),
    role: z.enum(["superadmin", "project-admin", "warehouse", "sales", "agent", "finance"]),
    projectId: z.string().nullable(),
    agentId: z.string().nullable().default(null),
    passwordHash: z.string().min(1),
    enabled: z.boolean().default(true),
  }),
);

/**
 * Local sign-in for mock storage. `npm run users:setup` writes .private/users.json with password hashes;
 * without that file nobody can sign in, so a fresh checkout is never open by default.
 */
export function loadBootstrapUsers(): UserCredential[] {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".private", "users.json"), "utf8");
    return fileSchema.parse(JSON.parse(raw)).map((u) => ({ ...u, email: u.email.toLowerCase() }));
  } catch {
    return [];
  }
}
