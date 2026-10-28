import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { AuthUser } from "@/models/auth";
import type { ProjectRepository } from "@/repositories/contracts";
import type { SessionRepository, UserRepository } from "@/repositories/auth/contracts";
import { AppError } from "@/utils/errors";
import { DUMMY_HASH, verifyPassword } from "./auth/password";
import { LoginRateLimiter } from "./auth/rate-limit";

export const SESSION_COOKIE = "buildflow_session";
export const SESSION_MAX_AGE = 8 * 60 * 60; // seconds

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export class AuthService {
  constructor(
    private users: UserRepository,
    private sessions: SessionRepository,
    private projects: ProjectRepository,
    private limiter = new LoginRateLimiter(),
    private now: () => number = Date.now,
  ) {}

  /** Checks the password and opens a session. The token is returned once; only its hash is stored. */
  async login(input: unknown): Promise<{ token: string; user: AuthUser; home: string }> {
    const data = loginSchema.parse(input);
    if (this.limiter.isBlocked(data.email)) throw new AppError("Too many attempts. Try again in a few minutes.", 429);

    const found = await this.users.findByEmail(data.email);
    const passwordOk = await verifyPassword(data.password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !found.enabled || !passwordOk || !(await this.isUsable(found))) {
      this.limiter.recordFailure(data.email);
      throw new AppError("Invalid email or password", 401);
    }
    this.limiter.reset(data.email);

    const { passwordHash: _hash, enabled: _enabled, ...user } = found;
    const token = randomBytes(32).toString("base64url");
    await this.sessions.purgeExpired(this.now());
    await this.sessions.create(hashToken(token), user.id, this.now() + SESSION_MAX_AGE * 1000);
    return { token, user, home: await this.homeFor(user) };
  }

  /** The user behind a session cookie, or null when missing, expired or the account is disabled. */
  async current(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;
    const hash = hashToken(token);
    const session = await this.sessions.find(hash);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      await this.sessions.delete(hash);
      return null;
    }
    const user = await this.users.findById(session.userId);
    return user && (await this.isUsable(user)) ? user : null;
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.delete(hashToken(token));
  }

  /** The first screen for a role. A project admin lands on their own project. */
  async homeFor(user: AuthUser): Promise<string> {
    switch (user.role) {
      case "superadmin":
        return "/superadmin";
      case "warehouse":
        return "/warehouse";
      case "finance":
        return "/finance";
      case "sales":
        return "/sales";
      case "agent":
        return user.agentId ? `/agent/${user.agentId}` : "/login";
      case "project-admin": {
        const project = user.projectId ? await this.projects.findById(user.projectId) : null;
        return project ? `/projects/${project.slug}` : "/login";
      }
    }
  }

  /** A project admin without a real project could not reach any page, so they cannot sign in. */
  private async isUsable(user: AuthUser): Promise<boolean> {
    if (user.role === "agent") return !!user.agentId;
    if (user.role !== "project-admin") return true;
    return !!user.projectId && !!(await this.projects.findById(user.projectId));
  }
}
