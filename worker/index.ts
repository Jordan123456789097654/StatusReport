// StatusReport background worker.
//
//   npm run worker                       (one region, all background jobs)
//   WORKER_REGION=eu-west WORKER_PRIMARY=false npm run worker   (extra check-only region)
//
// Every worker runs checks for monitors assigned to its WORKER_REGION. The primary worker also
// runs the singleton jobs: heartbeat deadlines, maintenance windows, escalations, custom-domain
// verification, data retention and static status-page snapshots.
import type { Monitor } from "@prisma/client";
import { db, isSqlite, json } from "../src/lib/db";
import { env } from "../src/lib/env";
import { runCheck } from "../src/lib/monitoring/runner";
import { monitorRegions, recordResult } from "../src/lib/monitoring/engine";
import { notify } from "../src/lib/notify/dispatcher";
import { verifyPageDomain } from "../src/lib/domains";
import { loadViewData, writeSnapshot } from "../src/lib/statuspage";
import type { EscalationStep } from "../src/lib/oncall";
import { formatDuration } from "../src/lib/format";

const REGION = env.region;
const PRIMARY = process.env.WORKER_PRIMARY !== "false";
const log = (...a: unknown[]) => console.log(new Date().toISOString(), `[worker:${REGION}]`, ...a);

let monitors: Monitor[] = [];
const lastRun = new Map<string, number>();
const running = new Set<string>();

async function refreshMonitors() {
  monitors = await db.monitor.findMany({ where: { paused: false, type: { not: "heartbeat" } } });
  monitors = monitors.filter((m) => monitorRegions(m).includes(REGION) || monitorRegions(m).includes("*"));
}

async function checkOne(m: Monitor) {
  running.add(m.id);
  try {
    const outcome = await runCheck(m);
    const fresh = await db.monitor.findUnique({ where: { id: m.id } });
    if (!fresh || fresh.paused) return;
    await recordResult(fresh, REGION, outcome);
    if (!outcome.ok) log(`✗ ${m.name}: ${outcome.error}`);
  } catch (e) {
    log(`check error for ${m.name}:`, (e as Error).message);
  } finally {
    running.delete(m.id);
  }
}

function schedulerTick() {
  const now = Date.now();
  for (const m of monitors) {
    if (running.size >= env.concurrency) break;
    if (running.has(m.id)) continue;
    const last = lastRun.get(m.id);
    // Spread the first run of each monitor across its interval to avoid a thundering herd.
    if (last === undefined) {
      const intervalMs = m.intervalSec * 1000;
      const lastChecked = m.lastCheckedAt?.getTime() ?? 0;
      const jitter = Math.random() * Math.min(5000, intervalMs);
      // Overdue (or never checked): run within the next few seconds. Otherwise wait until due.
      lastRun.set(m.id, now - lastChecked >= intervalMs ? now - intervalMs + jitter : lastChecked);
      continue;
    }
    if (now - last >= m.intervalSec * 1000) {
      lastRun.set(m.id, now);
      void checkOne(m);
    }
  }
}

// ── Singleton jobs (primary worker only) ─────────────────────────────────────

async function heartbeatDeadlines() {
  const beats = await db.monitor.findMany({ where: { type: "heartbeat", paused: false } });
  const now = Date.now();
  for (const m of beats) {
    const base = (m.lastHeartbeatAt ?? m.createdAt).getTime();
    const deadline = base + (m.intervalSec + m.heartbeatGraceSec) * 1000;
    if (now <= deadline) continue;
    const lastFail = m.lastCheckedAt?.getTime() ?? 0;
    if (m.status === "down" && now - lastFail < m.intervalSec * 1000) continue;
    await recordResult(m, "heartbeat", {
      ok: false,
      status: "down",
      error: `No heartbeat received for ${formatDuration(now - base)} (expected every ${formatDuration(m.intervalSec * 1000)} + ${formatDuration(m.heartbeatGraceSec * 1000)} grace)`,
    });
  }
}

async function maintenanceWindows() {
  const now = new Date();
  const starting = await db.maintenance.findMany({ where: { status: "scheduled", startsAt: { lte: now }, endsAt: { gt: now } } });
  for (const m of starting) {
    await db.maintenance.update({ where: { id: m.id }, data: { status: "in_progress" } });
    const ids = json<string[]>(m.monitorIds, []);
    if (ids.length) await db.monitor.updateMany({ where: { id: { in: ids } }, data: { inMaintenance: true } });
    await notify({ workspaceId: m.workspaceId, kind: "maintenance", maintenanceId: m.id });
    log(`maintenance started: ${m.title}`);
  }
  const ending = await db.maintenance.findMany({ where: { status: { in: ["scheduled", "in_progress"] }, endsAt: { lte: now } } });
  for (const m of ending) {
    await db.maintenance.update({ where: { id: m.id }, data: { status: "completed" } });
    const ids = json<string[]>(m.monitorIds, []);
    // Only clear the flag for monitors not covered by another active window.
    const others = await db.maintenance.findMany({ where: { workspaceId: m.workspaceId, status: "in_progress", id: { not: m.id } } });
    const stillCovered = new Set(others.flatMap((o) => json<string[]>(o.monitorIds, [])));
    const clear = ids.filter((id) => !stillCovered.has(id));
    if (clear.length) await db.monitor.updateMany({ where: { id: { in: clear } }, data: { inMaintenance: false } });
    log(`maintenance completed: ${m.title}`);
  }
}

async function escalations() {
  const open = await db.incident.findMany({
    where: { resolvedAt: null, acknowledgedAt: null },
    include: { monitors: { include: { monitor: true } } },
  });
  for (const inc of open) {
    const policyId = inc.monitors.find((m) => m.monitor.escalationPolicyId)?.monitor.escalationPolicyId;
    if (!policyId) continue;
    const policy = await db.escalationPolicy.findUnique({ where: { id: policyId } });
    const steps = json<EscalationStep[]>(policy?.steps, []);
    const nextIdx = inc.escalationStep + 1;
    const step = steps[nextIdx];
    if (!step) continue;
    if (Date.now() - inc.startedAt.getTime() < step.delayMin * 60_000) continue;
    const bumped = await db.incident.updateMany({ where: { id: inc.id, escalationStep: inc.escalationStep }, data: { escalationStep: nextIdx, lastEscalatedAt: new Date() } });
    if (bumped.count !== 1) continue;
    await db.incidentUpdate.create({ data: { incidentId: inc.id, status: "update", message: `Escalated to tier ${nextIdx + 1} (unacknowledged for ${step.delayMin} min).` } });
    await notify({ workspaceId: inc.workspaceId, kind: "down", incidentId: inc.id, channelIds: step.channelIds, escalationTier: nextIdx + 1, scheduleId: step.scheduleId, privateOnly: true });
    log(`escalated incident ${inc.number} to tier ${nextIdx + 1}`);
  }
}

async function domainVerification() {
  const pending = await db.statusPage.findMany({
    where: {
      customDomain: { not: null },
      OR: [
        { domainStatus: { in: ["pending", "failed"] }, OR: [{ domainCheckedAt: null }, { domainCheckedAt: { lt: new Date(Date.now() - 60_000) } }] },
        { domainStatus: "verified", domainCheckedAt: { lt: new Date(Date.now() - 6 * 3_600_000) } },
      ],
    },
    take: 50,
  });
  for (const p of pending) {
    const r = await verifyPageDomain(p.id);
    if (r.ok && p.domainStatus !== "verified") log(`custom domain verified: ${p.customDomain}`);
  }
}

async function retention() {
  const cutoff = new Date(Date.now() - env.retentionDays * 86_400_000);
  const { count } = await db.checkResult.deleteMany({ where: { createdAt: { lt: cutoff } } });
  await db.notificationLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3_600_000) } } });
  if (count) log(`retention: pruned ${count} raw check results older than ${env.retentionDays}d (daily rollups kept)`);
}

async function snapshots() {
  // Snapshots are written to local disk for the self-hosted "disaster mode". When the web app is
  // hosted elsewhere (e.g. Vercel) they would never be served, so they're opt-in.
  if (process.env.WORKER_SNAPSHOTS !== "true" && !isSqlite) return;
  const pages = await db.statusPage.findMany({ where: { visibility: "public" } });
  for (const p of pages) {
    try {
      await writeSnapshot(p, await loadViewData(p));
    } catch (e) {
      log(`snapshot failed for ${p.slug}:`, (e as Error).message);
    }
  }
}

function every(ms: number, name: string, fn: () => Promise<void>) {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      log(`${name} failed:`, (e as Error).message);
    } finally {
      busy = false;
    }
  };
  setTimeout(run, 2000);
  setInterval(run, ms);
}

async function main() {
  if (isSqlite) {
    await db.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
    await db.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
  }
  log(`starting (primary=${PRIMARY}, concurrency=${env.concurrency})`);
  // "Last seen" beacon: the dashboard warns when no worker has checked in recently.
  every(15_000, "beacon", async () => {
    const key = `worker:${REGION}`;
    await db.jobState.upsert({ where: { key }, create: { key, lastRunAt: new Date() }, update: { lastRunAt: new Date() } });
  });
  every(10_000, "refresh", refreshMonitors);
  await refreshMonitors().catch((e) => log("initial refresh failed (is the database migrated?)", e.message));
  setInterval(schedulerTick, 1000);
  if (PRIMARY) {
    every(15_000, "heartbeats", heartbeatDeadlines);
    every(30_000, "maintenance", maintenanceWindows);
    every(30_000, "escalations", escalations);
    every(60_000, "domains", domainVerification);
    every(3_600_000, "retention", retention);
    every(60_000, "snapshots", snapshots);
  }
}

process.on("SIGTERM", async () => {
  log("shutting down");
  await db.$disconnect();
  process.exit(0);
});

void main();
