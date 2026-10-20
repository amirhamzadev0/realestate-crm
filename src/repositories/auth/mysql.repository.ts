import "server-only";

import type { AuthUser, UserCredential } from "@/models/auth";
import { run, select, selectOne, type Row } from "@/repositories/mysql/db";
import type { SessionRepository, UserRepository } from "./contracts";

const COLUMNS = "id, email, name, role, project_id AS projectId";

const decodeUser = (row: Row) => row as unknown as AuthUser;

export class MysqlUserRepository implements UserRepository {
  async findByEmail(email: string) {
    const row = await selectOne(
      `SELECT ${COLUMNS}, password_hash AS passwordHash, enabled FROM users WHERE email = ?`,
      [email.trim().toLowerCase()],
    );
    return row ? ({ ...decodeUser(row), passwordHash: row.passwordHash, enabled: Boolean(row.enabled) } as UserCredential) : null;
  }
  async findById(id: string) {
    const row = await selectOne(`SELECT ${COLUMNS} FROM users WHERE id = ? AND enabled = 1`, [id]);
    return row ? decodeUser(row) : null;
  }
}

export class MysqlSessionRepository implements SessionRepository {
  async create(tokenHash: string, userId: string, expiresAt: number) {
    await run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [tokenHash, userId, expiresAt]);
  }
  async find(tokenHash: string) {
    const rows = await select("SELECT user_id AS userId, expires_at AS expiresAt FROM sessions WHERE token_hash = ?", [tokenHash]);
    const row = rows[0];
    return row ? { userId: String(row.userId), expiresAt: Number(row.expiresAt) } : null;
  }
  async delete(tokenHash: string) {
    await run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
  }
  async purgeExpired(now: number) {
    await run("DELETE FROM sessions WHERE expires_at <= ?", [now]);
  }
}
