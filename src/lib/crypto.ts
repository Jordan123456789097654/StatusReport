import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const SCRYPT = { N: 16384, r: 8, p: 1 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, SCRYPT);
  return timingSafeEqual(expected, actual);
}

export const sign = (value: string) => createHmac("sha256", env.secret).update(value).digest("base64url");

export function verifySignature(value: string, sig: string | null | undefined): boolean {
  if (!sig) return false;
  const a = Buffer.from(sign(value));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
