// Turns raw check outcomes into monitor state, incidents and alerts.
//  1. Persist the result + roll it into DailyStat.
//  2. Confirmation logic: DOWN only after N consecutive failures in ≥ M regions.
//  3. UP→DOWN opens a numbered incident (or joins a recent one: alert grouping).
//  4. DOWN→UP resolves the monitor's incidents once every affected monitor has recovered.
import type { Monitor } from "@prisma/client";
import { db } from "../db";
import { dayKey, formatDuration } from "../format";
import { notify } from "../notify/dispatcher";
import type { CheckOutcome } from "./types";

export function monitorRegions(m: Pick<Monitor, "type" | "regions">): string[] {
  if (m.type === "heartbeat") return ["heartbeat"];
  const list = m.regions.split(",").map((r) => r.trim()).filter(Boolean);
  return list.length ? list : ["local"];
}

export async function recordResult(monitor: Monitor, region: string, o: CheckOutcome): Promise<void> {
  const now = new Date();
  await db.checkResult.create({
    data: {
      monitorId: monitor.id,
      region,
      ok: o.ok,
      status: o.status,
      statusCode: o.statusCode ?? null,
      latencyMs: o.latencyMs ?? null,
      dnsMs: o.timings?.dns ?? null,
      tcpMs: o.timings?.tcp ?? null,
      tlsMs: o.timings?.tls ?? null,
      ttfbMs: o.timings?.ttfb ?? null,
      error: o.error?.slice(0, 1000) ?? null,
      snippet: o.snippet?.slice(0, 1000) ?? null,
      resolvedIp: o.ip ?? null,
    },
  });

  const day = dayKey(now);
  const lat = o.latencyMs ?? 0;
  await db.dailyStat.upsert({
    where: { monitorId_day: { monitorId: monitor.id, day } },
    create: {
      monitorId: monitor.id,
      day,
      total: 1,
      up: o.ok ? 1 : 0,
      degraded: o.status === "degraded" ? 1 : 0,
      latencySum: o.ok ? lat : 0,
      latencyCount: o.ok && o.latencyMs != null ? 1 : 0,
    },
    update: {
      total: { increment: 1 },
      up: { increment: o.ok ? 1 : 0 },
      degraded: { increment: o.status === "degraded" ? 1 : 0 },
      latencySum: { increment: o.ok ? lat : 0 },
      latencyCount: { increment: o.ok && o.latencyMs != null ? 1 : 0 },
    },
  });

  await db.monitor.update({
    where: { id: monitor.id },
    data: {
      lastCheckedAt: now,
      lastError: o.ok ? null : (o.error ?? "Check failed"),
      ...(o.ssl ? { sslExpiresAt: o.ssl.expiresAt, sslIssuer: o.ssl.issuer } : {}),
      ...(o.domainExpiresAt ? { domainExpiresAt: o.domainExpiresAt } : {}),
    },
  });

  if (o.expiryDaysLeft != null && (monitor.type === "ssl" || monitor.type === "domain")) {
    await handleExpiry(monitor, o.expiryDaysLeft, o.ssl?.expiresAt ?? o.domainExpiresAt ?? now);
  }

  await evaluate(monitor, region, o);
}

async function handleExpiry(monitor: Monitor, daysLeft: number, date: Date) {
  const thresholds = monitor.sslThresholds.split(",").map(Number).filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  if (!thresholds.length) return;
  const crossed = thresholds.find((t) => daysLeft <= t);
  if (crossed === undefined) {
    if (monitor.lastExpiryAlertDays != null) await db.monitor.update({ where: { id: monitor.id }, data: { lastExpiryAlertDays: null } });
    return;
  }
  if (monitor.lastExpiryAlertDays != null && crossed >= monitor.lastExpiryAlertDays) return;
  await db.monitor.update({ where: { id: monitor.id }, data: { lastExpiryAlertDays: crossed } });
  await notify({
    workspaceId: monitor.workspaceId,
    kind: "expiry",
    monitorId: monitor.id,
    expiry: { days: Math.max(daysLeft, 0), kind: monitor.type === "ssl" ? "SSL certificate" : "Domain", date },
  });
}

async function evaluate(monitor: Monitor, region: string, o: CheckOutcome) {
  const regions = monitorRegions(monitor);
  const n = monitor.type === "heartbeat" ? 1 : Math.max(1, monitor.confirmations);
  const windowMs = Math.max(monitor.intervalSec * 1000 * (n + 3), 10 * 60_000);
  const recent = await db.checkResult.findMany({
    where: { monitorId: monitor.id, createdAt: { gte: new Date(Date.now() - windowMs) } },
    orderBy: { createdAt: "desc" },
    take: n * regions.length * 4 + 10,
    select: { region: true, ok: true, status: true },
  });

  const byRegion = new Map<string, { ok: boolean; status: string }[]>();
  for (const r of recent) {
    if (!regions.includes(r.region)) continue;
    const list = byRegion.get(r.region) || [];
    list.push(r);
    byRegion.set(r.region, list);
  }
  const reporting = [...byRegion.keys()];
  const failing = reporting.filter((r) => {
    const list = byRegion.get(r)!;
    return list.length >= n && list.slice(0, n).every((x) => !x.ok);
  });
  const needed = Math.min(Math.max(1, monitor.confirmRegions), Math.max(1, reporting.length));
  const allLatestOk = reporting.length > 0 && reporting.every((r) => byRegion.get(r)![0].ok);
  const anyDegraded = reporting.some((r) => byRegion.get(r)![0].status === "degraded");

  const prev = monitor.status;
  let next = prev;
  if (failing.length >= needed) next = "down";
  else if (allLatestOk) next = anyDegraded ? "degraded" : "up";
  if (next === prev || monitor.paused) return;

  // Optimistic lock: only one worker/region wins a transition.
  const won = await db.monitor.updateMany({ where: { id: monitor.id, status: prev }, data: { status: next, lastStatusChange: new Date() } });
  if (won.count !== 1) return;

  if (next === "down") await openIncident(monitor, region, o);
  else if (prev === "down") await resolveForMonitor(monitor, region, o);
}

export async function openIncident(monitor: Monitor, region: string, o: CheckOutcome) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: monitor.workspaceId } });
  const cause = o.error || "Check failed";

  // Never open a second incident for a monitor that already has an unresolved one.
  const already = await db.incidentMonitor.findFirst({ where: { monitorId: monitor.id, resolvedAt: null, incident: { resolvedAt: null } } });
  if (already) return;

  // Smart grouping: a cascade of failures within the window shares one parent incident.
  // Only incidents that don't already include this monitor qualify.
  const recent = await db.incident.findFirst({
    where: {
      workspaceId: ws.id,
      auto: true,
      resolvedAt: null,
      startedAt: { gte: new Date(Date.now() - ws.groupingWindowSec * 1000) },
      monitors: { none: { monitorId: monitor.id } },
    },
    orderBy: { startedAt: "desc" },
  });
  if (recent && ws.groupingWindowSec > 0) {
    await db.incidentMonitor.upsert({
      where: { incidentId_monitorId: { incidentId: recent.id, monitorId: monitor.id } },
      create: { incidentId: recent.id, monitorId: monitor.id },
      update: { resolvedAt: null },
    });
    await db.incidentUpdate.create({
      data: { incidentId: recent.id, status: "update", message: `**${monitor.name}** is also affected. Error: \`${cause}\`` },
    });
    await db.incident.update({ where: { id: recent.id }, data: { severity: "major", title: recent.title.includes(" and others") ? recent.title : `${recent.title.replace(/ is down$/, "")} and others are down` } });
    await notify({ workspaceId: ws.id, kind: "grouped", incidentId: recent.id, monitorId: monitor.id, outcome: o, region });
    return;
  }

  const bumped = await db.workspace.update({ where: { id: ws.id }, data: { incidentCounter: { increment: 1 } } });
  const incident = await db.incident.create({
    data: {
      workspaceId: ws.id,
      number: bumped.incidentCounter,
      title: `${monitor.name} is down`,
      status: "investigating",
      severity: "major",
      auto: true,
      cause,
      monitors: { create: { monitorId: monitor.id } },
      updates: { create: { status: "investigating", message: `We're investigating an issue affecting **${monitor.name}**.` } },
    },
  });
  await notify({ workspaceId: ws.id, kind: "down", incidentId: incident.id, monitorId: monitor.id, outcome: o, region });
}

export async function resolveForMonitor(monitor: Monitor, region: string, o: CheckOutcome) {
  const links = await db.incidentMonitor.findMany({
    where: { monitorId: monitor.id, resolvedAt: null, incident: { resolvedAt: null, auto: true } },
    include: { incident: true },
  });
  for (const link of links) {
    await db.incidentMonitor.update({ where: { id: link.id }, data: { resolvedAt: new Date() } });
    const open = await db.incidentMonitor.count({ where: { incidentId: link.incidentId, resolvedAt: null } });
    if (open > 0) {
      await db.incidentUpdate.create({ data: { incidentId: link.incidentId, status: "update", message: `**${monitor.name}** has recovered.` } });
      continue;
    }
    const resolvedAt = new Date();
    const res = await db.incident.updateMany({
      where: { id: link.incidentId, resolvedAt: null },
      data: { status: "resolved", resolvedAt },
    });
    if (res.count !== 1) continue;
    const duration = formatDuration(resolvedAt.getTime() - link.incident.startedAt.getTime());
    await db.incidentUpdate.create({
      data: { incidentId: link.incidentId, status: "resolved", message: `**${monitor.name}** has recovered. Resolved automatically after ${duration}.` },
    });
    await notify({ workspaceId: monitor.workspaceId, kind: "up", incidentId: link.incidentId, monitorId: monitor.id, outcome: { ...o, error: link.incident.cause || o.error }, region });
  }
}

/** Called by the heartbeat endpoint whenever a job checks in. */
export async function recordHeartbeat(monitor: Monitor, ok = true, message?: string) {
  await db.monitor.update({ where: { id: monitor.id }, data: { lastHeartbeatAt: new Date() } });
  await recordResult(monitor, "heartbeat", ok ? { ok: true, status: "up" } : { ok: false, status: "down", error: message || "Job reported a failure" });
}
