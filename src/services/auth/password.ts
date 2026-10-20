import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Format: "scrypt:<16-byte hex salt>:<64-byte hex key>". scripts/lib/password.mjs writes the same format.
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString("hex")}:${(await derive(password, salt)).toString("hex")}`;
}

/** Verified against DUMMY_HASH for unknown users so timing does not reveal which emails exist. */
export const DUMMY_HASH = `scrypt:${"00".repeat(16)}:${"00".repeat(KEY_LENGTH)}`;

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, Buffer.from(saltHex, "hex"));
  return timingSafeEqual(actual, expected);
}
