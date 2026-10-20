import type { AuthUser, SessionRecord, UserCredential } from "@/models/auth";

export interface UserRepository {
  findByEmail(email: string): Promise<UserCredential | null>;
  /** Only enabled users are returned. */
  findById(id: string): Promise<AuthUser | null>;
}

export interface SessionRepository {
  create(tokenHash: string, userId: string, expiresAt: number): Promise<void>;
  find(tokenHash: string): Promise<SessionRecord | null>;
  delete(tokenHash: string): Promise<void>;
  purgeExpired(now: number): Promise<void>;
}
