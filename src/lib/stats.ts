import { db } from "./db";
import { dayKey } from "./format";

/** Uptime % per monitor over the last `days` days, from DailyStat rollups. */
export async function uptimeByMonitor(monitorIds: string[], days: number): Promise<Map<string, number | null>> {
  const since = dayKey(new Date(Date.now() - (days - 1) * 86_400_000));
  const rows = await db.dailyStat.findMany({ where: { monitorId: { in: monitorIds }, day: { gte: since } } });
  const acc = new Map<string, { up: number; total: number }>();
  for (const r of rows) {
    const a = acc.get(r.monitorId) || { up: 0, total: 0 };
    a.up += r.up;
    a.total += r.total;
    acc.set(r.monitorId, a);
  }
  return new Map(monitorIds.map((id) => [id, acc.get(id)?.total ? (acc.get(id)!.up / acc.get(id)!.total) * 100 : null]));
}

export async function uptime24h(monitorId: string): Promise<number | null> {
  const since = new Date(Date.now() - 86_400_000);
  const [total, ok] = await Promise.all([
    db.checkResult.count({ where: { monitorId, createdAt: { gte: since } } }),
    db.checkResult.count({ where: { monitorId, createdAt: { gte: since }, ok: true } }),
  ]);
  return total ? (ok / total) * 100 : null;
}

/** Response-time series for the dashboard chart, bucketed. */
export async function latencySeries(monitorId: string, hours = 24, bucketMin = 15) {
  const rows = await db.checkResult.findMany({
    where: { monitorId, createdAt: { gte: new Date(Date.now() - hours * 3_600_000) }, ok: true, latencyMs: { not: null } },
    select: { createdAt: true, latencyMs: true },
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });
  const size = bucketMin * 60_000;
  const buckets = new Map<number, { s: number; n: number }>();
  for (const r of rows) {
    const k = Math.floor(r.createdAt.getTime() / size) * size;
    const b = buckets.get(k) || { s: 0, n: 0 };
    b.s += r.latencyMs!;
    b.n++;
    buckets.set(k, b);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => ({ t, v: Math.round(b.s / b.n) }));
}

export async function recentBars(monitorId: string, days = 30) {
  const since = dayKey(new Date(Date.now() - (days - 1) * 86_400_000));
  const rows = await db.dailyStat.findMany({ where: { monitorId, day: { gte: since } } });
  const by = new Map(rows.map((r) => [r.day, r]));
  return Array.from({ length: days }, (_, i) => {
    const day = dayKey(new Date(Date.now() - (days - 1 - i) * 86_400_000));
    const r = by.get(day);
    if (!r || !r.total) return { day, uptime: null, incidents: 0, status: "nodata" as const };
    const u = (r.up / r.total) * 100;
    return { day, uptime: u, incidents: 0, status: (u >= 99.9 ? "up" : u >= 99 ? "degraded" : "down") as "up" | "degraded" | "down" };
  });
}
