import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { ZodError } from "zod";
import type { UserCredential } from "@/models/auth";
import { MemorySessionRepository, MemoryUserRepository } from "@/repositories/auth/memory.repository";
import { MockProjectRepository } from "@/repositories/mock/project.repository";
import { hashPassword, verifyPassword } from "@/services/auth/password";
import { LoginRateLimiter } from "@/services/auth/rate-limit";
import { AuthService, SESSION_MAX_AGE } from "@/services/auth.service";
import { AppError } from "@/utils/errors";

let users: UserCredential[];
let sessions: MemorySessionRepository;
let clock: number;
let auth: AuthService;

async function user(id: string, role: UserCredential["role"], projectId: string | null, extra: Partial<UserCredential> = {}) {
  return { id, email: `${id}@test.local`, name: id, role, projectId, passwordHash: await hashPassword("correct-horse"), enabled: true, ...extra };
}

beforeEach(async () => {
  delete (globalThis as Record<string, unknown>).__crm_mock_store__;
  users = [
    await user("owner", "superadmin", null),
    await user("pm", "project-admin", "p1"),
    await user("ghost", "project-admin", "no-such-project"),
    await user("lost", "project-admin", null),
    await user("off", "sales", null, { enabled: false }),
  ];
  sessions = new MemorySessionRepository();
  clock = 1_000_000;
  auth = new AuthService(new MemoryUserRepository(users), sessions, new MockProjectRepository(), new LoginRateLimiter(5, 900_000, 2000, () => clock), () => clock);
});

const status = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return 200;
  } catch (error) {
    return error instanceof AppError ? error.status : 500;
  }
};

describe("passwords", () => {
  it("verifies the right password only, and rejects malformed hashes", async () => {
    const hash = await hashPassword("secret");
    assert.equal(await verifyPassword("secret", hash), true);
    assert.equal(await verifyPassword("Secret", hash), false);
    assert.equal(await verifyPassword("secret", "not-a-hash"), false);
  });
});

describe("login", () => {
  it("signs in and sends each role to its own portal", async () => {
    assert.equal((await auth.login({ email: "owner@test.local", password: "correct-horse" })).home, "/superadmin");
    assert.equal((await auth.login({ email: "PM@test.local", password: "correct-horse" })).home, "/projects/green-valley");
  });

  it("returns the same 401 for a wrong password and an unknown email", async () => {
    assert.equal(await status(auth.login({ email: "owner@test.local", password: "nope" })), 401);
    assert.equal(await status(auth.login({ email: "nobody@test.local", password: "nope" })), 401);
  });

  it("refuses disabled accounts and project admins without a real project", async () => {
    for (const id of ["off", "ghost", "lost"]) {
      assert.equal(await status(auth.login({ email: `${id}@test.local`, password: "correct-horse" })), 401, id);
    }
  });

  it("locks an email after 5 failures, even for the right password, until the window passes", async () => {
    for (let i = 0; i < 5; i++) await status(auth.login({ email: "owner@test.local", password: "bad" }));
    assert.equal(await status(auth.login({ email: "owner@test.local", password: "correct-horse" })), 429);
    clock += 900_001;
    assert.equal(await status(auth.login({ email: "owner@test.local", password: "correct-horse" })), 200);
  });

  it("rejects invalid input before touching the database", async () => {
    await assert.rejects(auth.login({ email: "not-an-email", password: "x" }), ZodError); // the API maps this to 400
  });
});

describe("sessions", () => {
  it("resolves the user from the token and forgets it after logout", async () => {
    const { token } = await auth.login({ email: "owner@test.local", password: "correct-horse" });
    assert.equal((await auth.current(token))?.role, "superadmin");
    await auth.logout(token);
    assert.equal(await auth.current(token), null);
  });

  it("stores only a hash of the token", async () => {
    const { token } = await auth.login({ email: "owner@test.local", password: "correct-horse" });
    assert.equal(await sessions.find(token), null);
  });

  it("expires after the session lifetime", async () => {
    const { token } = await auth.login({ email: "owner@test.local", password: "correct-horse" });
    clock += SESSION_MAX_AGE * 1000 + 1;
    assert.equal(await auth.current(token), null);
  });

  it("ends the session when the account is disabled afterwards", async () => {
    const { token } = await auth.login({ email: "owner@test.local", password: "correct-horse" });
    users[0].enabled = false;
    assert.equal(await auth.current(token), null);
  });

  it("treats missing or unknown tokens as signed out", async () => {
    assert.equal(await auth.current(undefined), null);
    assert.equal(await auth.current("garbage"), null);
  });
});
