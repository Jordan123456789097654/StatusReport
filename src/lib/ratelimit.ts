// Sliding-window rate limiting.
//  • PostgreSQL (Vercel + Neon): counted in the database so every serverless instance shares one view.
//    Used for security-sensitive buckets (login, 2FA, sign-up, page unlock, subscribe, report-issue).
//  • SQLite, or very high limits (≥ 100/window, e.g. public read endpoints): in-process counters.
import { db, isSqlite } from "./db";
import { env } from "./env";

type Result = { ok: boolean; retryAfter: number };

const buckets = new Map<string, number[]>();

function memoryLimit(key: string, limit: number, windowMs: number): Result {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 50_000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return { ok: true, retryAfter: 0 };
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<Result> {
  if (isSqlite || limit >= 100) return memoryLimit(key, limit, windowMs);
  try {
    const now = Date.now();
    const hits = await db.rateLimitHit.findMany({
      where: { key, createdAt: { gte: new Date(now - windowMs) } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
      take: limit,
    });
    if (hits.length >= limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - hits[0].createdAt.getTime())) / 1000)) };
    await db.rateLimitHit.create({ data: { key } });
    return { ok: true, retryAfter: 0 };
  } catch (e) {
    // If the database hiccups, fall back to this instance's counters rather than failing requests.
    console.warn("[ratelimit] database limiter failed, using memory:", (e as Error).message);
    return memoryLimit(key, limit, windowMs);
  }
}

export function clientIp(headers: Headers): string {
  if (env.trustProxy) {
    const fwd = headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
    const real = headers.get("x-real-ip");
    if (real) return real;
  }
  return "direct";
}

export function tooMany(retryAfter: number) {
  return Response.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
}
