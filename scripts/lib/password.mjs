import { randomBytes, scryptSync } from "node:crypto";

// Same format as src/services/auth/password.ts: "scrypt:<16-byte hex salt>:<64-byte hex key>".
export function hashPassword(password) {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function randomPassword() {
  return randomBytes(12).toString("base64url");
}
