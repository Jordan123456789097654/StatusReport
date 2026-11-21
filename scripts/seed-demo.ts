// Fills a SCRATCH database with realistic demo data (monitors, 90 days of uptime, latency, incidents,
// a status page) so real screenshots of the product can be captured. Never run this against production.
//   DATABASE_URL=file:../data/demo.db npm run db:seed-demo
import { PrismaClient, type Monitor } from "@prisma/client";
import { hashPassword } from "../src/lib/crypto";

if (!/^file:/.test(process.env.DATABASE_URL || "")) throw new Error("seed-demo only runs against a SQLite scratch database (DATABASE_URL=file:…).");

const db = new PrismaClient();
export const DEMO_EMAIL = "demo@northwind.test";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo-screenshots-only";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261121);
const MIN = 60_000;
const DAY = 86_400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

const MONITORS = [
  { name: "API", target: "https://api.northwind.dev/v1/health", base: 96, section: "Core platform", incidentDays: { 9: 38 } },
  { name: "Website", target: "https://northwind.dev", base: 142, section: "Core platform", incidentDays: {} },
  { name: "Dashboard", target: "https://app.northwind.dev/login", base: 188, section: "Core platform", incidentDays: { 31: 4 } },
  { name: "Checkout", target: "https://pay.northwind.dev/health", base: 121, section: "Core platform", incidentDays: { 9: 22 } },
  { name: "Database", target: "db.northwind.dev:5432", base: 14, section: "Infrastructure", incidentDays: {}, type: "tcp" },
  { name: "Search", target: "https://search.northwind.dev/ping", base: 64, section: "Infrastructure", incidentDays: { 22: 52 } },
  { name: "Webhooks", target: "https://hooks.northwind.dev/ping", base: 77, section: "Infrastructure", incidentDays: { 47: 6 } },
  { name: "CDN & assets", target: "https://cdn.northwind.dev/health", base: 38, section: "Infrastructure", incidentDays: {} },
];

async function main() {
  const user = await db.user.create({ data: { email: DEMO_EMAIL, name: "Avery Chen", passwordHash: hashPassword(DEMO_PASSWORD) } });
  const ws = await db.workspace.create({
    data: { name: "Northwind Labs", slug: "northwind-labs", incidentPrefix: "NORTH", incidentCounter: 14, memberships: { create: { userId: user.id, role: "owner" } } },
  });

  const now = Date.now();
  const monitors: { m: Monitor; def: (typeof MONITORS)[number] }[] = [];
  for (const def of MONITORS) {
    const m = await db.monitor.create({
      data: {
        workspaceId: ws.id,
        name: def.name,
        type: def.type || "http",
        target: def.target,
        method: "GET",
        intervalSec: 60,
        regions: "local",
        status: "up",
        lastCheckedAt: new Date(now - 20_000),
        lastStatusChange: new Date(now - 11 * DAY),
        sslExpiresAt: def.type === "tcp" ? null : new Date(now + 58 * DAY),
        sslIssuer: def.type === "tcp" ? null : "Let's Encrypt",
      },
    });
    monitors.push({ m, def });

    // 90 days of daily uptime rollups.
    const rows = [];
    for (let i = 89; i >= 0; i--) {
      const down = (def.incidentDays as Record<number, number>)[i] || 0;
      const total = 1440;
      rows.push({
        monitorId: m.id,
        day: dayKey(new Date(now - i * DAY)),
        total,
        up: total - down,
        degraded: rand() > 0.97 ? 6 : 0,
        latencySum: Math.round(def.base * (total - down) * (0.95 + rand() * 0.1)),
        latencyCount: total - down,
      });
    }
    await db.dailyStat.createMany({ data: rows });

    // Last 24h of checks every 10 minutes, with a gentle daily curve and a few spikes.
    const checks = [];
    for (let i = 143; i >= 0; i--) {
      const t = now - i * 10 * MIN;
      const wave = Math.sin((t / DAY) * Math.PI * 2) * def.base * 0.12;
      const spike = rand() > 0.96 ? def.base * (0.6 + rand()) : 0;
      const lat = Math.max(8, Math.round(def.base + wave + spike + (rand() - 0.5) * def.base * 0.18));
      const dns = def.type === "tcp" ? 0 : Math.round(6 + rand() * 10);
      const tcp = Math.round(8 + rand() * 12);
      const tls = def.type === "tcp" ? 0 : Math.round(20 + rand() * 24);
      checks.push({
        monitorId: m.id,
        region: "local",
        ok: true,
        status: "up",
        statusCode: def.type === "tcp" ? null : 200,
        latencyMs: lat,
        dnsMs: dns,
        tcpMs: tcp,
        tlsMs: tls,
        ttfbMs: Math.max(1, lat - dns - tcp - tls),
        createdAt: new Date(t),
      });
    }
    await db.checkResult.createMany({ data: checks });
  }

  await db.deployment.createMany({
    data: [
      { workspaceId: ws.id, version: "v2.41.0", environment: "production", createdAt: new Date(now - 17 * 3_600_000) },
      { workspaceId: ws.id, version: "v2.41.1", environment: "production", createdAt: new Date(now - 6 * 3_600_000) },
    ],
  });

  const byName = (n: string) => monitors.find((x) => x.def.name === n)!.m;
  const mkIncident = async (opts: {
    number: number;
    title: string;
    severity: string;
    daysAgo: number;
    minutes: number;
    monitors: string[];
    cause: string;
    updates: { status: string; message: string; offsetMin: number }[];
    postmortem?: string;
  }) => {
    const started = new Date(now - opts.daysAgo * DAY - 3 * 3_600_000);
    const resolved = new Date(started.getTime() + opts.minutes * MIN);
    await db.incident.create({
      data: {
        workspaceId: ws.id,
        number: opts.number,
        title: opts.title,
        status: "resolved",
        severity: opts.severity,
        auto: true,
        cause: opts.cause,
        startedAt: started,
        acknowledgedAt: new Date(started.getTime() + 4 * MIN),
        acknowledgedBy: "Avery Chen",
        resolvedAt: resolved,
        postmortem: opts.postmortem ?? null,
        postmortemPublished: Boolean(opts.postmortem),
        monitors: { create: opts.monitors.map((n) => ({ monitorId: byName(n).id, resolvedAt: resolved })) },
        updates: { create: opts.updates.map((u) => ({ status: u.status, message: u.message, createdAt: new Date(started.getTime() + u.offsetMin * MIN) })) },
      },
    });
  };

  await mkIncident({
    number: 14,
    title: "Elevated API error rates",
    severity: "partial",
    daysAgo: 9,
    minutes: 38,
    monitors: ["API", "Checkout"],
    cause: "Unexpected status code 503 (expected 200-299)",
    updates: [
      { status: "investigating", message: "We're investigating elevated **5xx error rates** on the API and checkout.", offsetMin: 0 },
      { status: "identified", message: "A misconfigured connection pool on one of our API nodes is exhausting database connections. We're rolling it back.", offsetMin: 14 },
      { status: "monitoring", message: "The rollback is complete and error rates are back to normal. We're watching closely.", offsetMin: 29 },
      { status: "resolved", message: "This incident has been resolved. Checkout and API traffic are fully restored.", offsetMin: 38 },
    ],
    postmortem:
      "## Summary\nA deploy changed the database connection pool size on one API node, exhausting connections for 38 minutes.\n\n## Impact\n- Affected services: API, Checkout\n- Duration: 38 minutes\n\n## Root cause\nThe pool limit was set below peak concurrency, so requests queued and timed out.\n\n## Action items\n1. Add a pool-saturation alert.\n2. Validate pool settings in CI.",
  });
  await mkIncident({
    number: 13,
    title: "Search latency degraded",
    severity: "degraded",
    daysAgo: 22,
    minutes: 52,
    monitors: ["Search"],
    cause: "Response time 1840ms exceeds 1000ms",
    updates: [
      { status: "investigating", message: "Search responses are slower than usual.", offsetMin: 0 },
      { status: "resolved", message: "An index rebuild finished and search latency is back to normal.", offsetMin: 52 },
    ],
  });
  await mkIncident({
    number: 12,
    title: "Dashboard login unavailable",
    severity: "major",
    daysAgo: 31,
    minutes: 4,
    monitors: ["Dashboard"],
    cause: "Connection timed out after 10000ms",
    updates: [
      { status: "investigating", message: "The dashboard login page is not responding.", offsetMin: 0 },
      { status: "resolved", message: "A restart of the web tier restored service.", offsetMin: 4 },
    ],
  });

  await db.maintenance.create({
    data: {
      workspaceId: ws.id,
      title: "Database upgrade",
      description: "We're upgrading our primary Postgres cluster. Expect brief read-only periods.",
      startsAt: new Date(now + 3 * DAY),
      endsAt: new Date(now + 3 * DAY + 2 * 3_600_000),
      monitorIds: JSON.stringify([byName("Database").id, byName("API").id]),
    },
  });

  const page = await db.statusPage.create({
    data: { workspaceId: ws.id, slug: "northwind", name: "Northwind Status", description: "Live status for Northwind's products and services.", theme: "clean-light", websiteUrl: "https://northwind.dev" },
  });
  const sections = [
    await db.statusPageSection.create({ data: { statusPageId: page.id, name: "Core platform", order: 0 } }),
    await db.statusPageSection.create({ data: { statusPageId: page.id, name: "Infrastructure", order: 1 } }),
  ];
  for (const [i, { m, def }] of monitors.entries()) {
    await db.statusPageComponent.create({
      data: { statusPageId: page.id, monitorId: m.id, order: i, sectionId: sections[def.section === "Core platform" ? 0 : 1].id },
    });
  }

  await db.alertChannel.create({
    data: { workspaceId: ws.id, name: "#status-updates", type: "discord", visibility: "public", config: JSON.stringify({ url: "https://discord.com/api/webhooks/123456789012345678/demo-token-not-real" }) },
  });
  await db.alertChannel.create({
    data: { workspaceId: ws.id, name: "#ops-alerts", type: "discord", visibility: "private", config: JSON.stringify({ url: "https://discord.com/api/webhooks/123456789012345679/demo-token-not-real" }) },
  });

  await db.jobState.upsert({ where: { key: "worker:local" }, create: { key: "worker:local", lastRunAt: new Date() }, update: { lastRunAt: new Date() } });
  console.log(`[seed-demo] ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}  (workspace Northwind Labs, status page /s/northwind)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
