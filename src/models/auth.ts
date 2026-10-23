import type { Role } from "@/models/site";

/** The signed-in person. Never contains the password hash. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  projectId: string | null; // set for project-admin: the only project they may open
  agentId: string | null; // set for agent: the only agent portal they may open
}

/** A user as stored, including what is needed to verify a password. */
export interface UserCredential extends AuthUser {
  passwordHash: string;
  enabled: boolean;
}

export interface SessionRecord {
  userId: string;
  expiresAt: number; // epoch ms
}
