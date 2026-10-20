import type { AuthUser, SessionRecord, UserCredential } from "@/models/auth";
import type { SessionRepository, UserRepository } from "./contracts";

const toUser = ({ passwordHash: _hash, enabled: _enabled, ...user }: UserCredential): AuthUser => user;

/** Users held in memory: used for local development (mock storage) and tests. */
export class MemoryUserRepository implements UserRepository {
  constructor(private users: UserCredential[]) {}

  async findByEmail(email: string) {
    const found = this.users.find((u) => u.email === email.trim().toLowerCase());
    return found ? structuredClone(found) : null;
  }
  async findById(id: string) {
    const found = this.users.find((u) => u.id === id && u.enabled);
    return found ? toUser(structuredClone(found)) : null;
  }
}

export class MemorySessionRepository implements SessionRepository {
  private sessions = new Map<string, SessionRecord>();

  async create(tokenHash: string, userId: string, expiresAt: number) {
    this.sessions.set(tokenHash, { userId, expiresAt });
  }
  async find(tokenHash: string) {
    const found = this.sessions.get(tokenHash);
    return found ? { ...found } : null;
  }
  async delete(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }
  async purgeExpired(now: number) {
    for (const [hash, session] of this.sessions) if (session.expiresAt <= now) this.sessions.delete(hash);
  }
}
