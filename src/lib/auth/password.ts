// Password hashing with scrypt from node:crypto (no third-party dependency).
// Stored format: scrypt$N$r$p$salt$hash, both base64url.

import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));

const PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;
export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { ...PARAMS, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function validateCredentials(email: string, password: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return "Skriv en gyldig email.";
  if (password.length < MIN_PASSWORD_LENGTH) return `Adgangskoden skal være mindst ${MIN_PASSWORD_LENGTH} tegn.`;
  if (password.length > 200) return "Adgangskoden er for lang.";
  return null;
}

/** Best-effort, per-process attempt limiter for sign-in and sign-up. */
const attempts = new Map<string, { count: number; resetAt: number }>();
export const ATTEMPT_LIMIT = { max: 10, windowMs: 15 * 60_000 };

export function allowAttempt(key: string, now = Date.now()): boolean {
  const a = attempts.get(key);
  if (!a || a.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_LIMIT.windowMs });
    return true;
  }
  a.count++;
  return a.count <= ATTEMPT_LIMIT.max;
}
