// Incident operations shared by dashboard actions, the REST API and signed ack links.
import { db } from "./db";
import { notify } from "./notify/dispatcher";

export const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;
export const SEVERITIES = [
  { value: "degraded", label: "Degraded performance" },
  { value: "partial", label: "Partial outage" },
  { value: "major", label: "Major outage" },
  { value: "maintenance", label: "Under maintenance" },
] as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function createManualIncident(
  workspaceId: string,
  input: { title: string; message: string; status?: string; severity?: string; monitorIds?: string[]; public?: boolean; notify?: boolean; authorId?: string | null },
) {
  const status = INCIDENT_STATUSES.includes(input.status as (typeof INCIDENT_STATUSES)[number]) ? input.status! : "investigating";
  const severity = SEVERITIES.some((s) => s.value === input.severity) ? input.severity! : "major";
  const monitors = input.monitorIds?.length
    ? await db.monitor.findMany({ where: { workspaceId, id: { in: input.monitorIds } }, select: { id: true } })
    : [];
  const ws = await db.workspace.update({ where: { id: workspaceId }, data: { incidentCounter: { increment: 1 } } });
  const incident = await db.incident.create({
    data: {
      workspaceId,
      number: ws.incidentCounter,
      title: input.title.slice(0, 200),
      status,
      severity,
      public: input.public ?? true,
      resolvedAt: status === "resolved" ? new Date() : null,
      monitors: { create: monitors.map((m) => ({ monitorId: m.id })) },
      updates: { create: { status, message: input.message || cap(status), authorId: input.authorId ?? null } },
    },
  });
  if (input.notify !== false) {
    await notify({ workspaceId, kind: "update", incidentId: incident.id, update: { status: cap(status), message: input.message || incident.title } });
  }
  return incident;
}

export async function postIncidentUpdate(
  incidentId: string,
  input: { status: string; message: string; authorId?: string | null; notify?: boolean; severity?: string },
) {
  const incident = await db.incident.findUniqueOrThrow({ where: { id: incidentId } });
  const status = INCIDENT_STATUSES.includes(input.status as (typeof INCIDENT_STATUSES)[number]) ? input.status : incident.status;
  await db.incidentUpdate.create({ data: { incidentId, status, message: input.message, authorId: input.authorId ?? null } });
  const resolving = status === "resolved" && !incident.resolvedAt;
  await db.incident.update({
    where: { id: incidentId },
    data: {
      status,
      ...(SEVERITIES.some((s) => s.value === input.severity) ? { severity: input.severity } : {}),
      ...(resolving ? { resolvedAt: new Date() } : {}),
      ...(status !== "resolved" && incident.resolvedAt ? { resolvedAt: null } : {}),
    },
  });
  if (resolving) await db.incidentMonitor.updateMany({ where: { incidentId, resolvedAt: null }, data: { resolvedAt: new Date() } });
  if (input.notify !== false) {
    await notify({ workspaceId: incident.workspaceId, kind: "update", incidentId, update: { status: cap(status), message: input.message } });
  }
}

export async function acknowledgeIncident(incidentId: string, by: string) {
  const res = await db.incident.updateMany({ where: { id: incidentId, acknowledgedAt: null }, data: { acknowledgedAt: new Date(), acknowledgedBy: by } });
  if (res.count) {
    await db.incidentUpdate.create({ data: { incidentId, status: "update", message: `Acknowledged by ${by}.` } });
  }
  return res.count > 0;
}

/** MTTA / MTTR over the given incidents (milliseconds). */
export function mttStats(list: { startedAt: Date; acknowledgedAt: Date | null; resolvedAt: Date | null }[]) {
  const acked = list.filter((i) => i.acknowledgedAt);
  const resolved = list.filter((i) => i.resolvedAt);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    mtta: avg(acked.map((i) => i.acknowledgedAt!.getTime() - i.startedAt.getTime())),
    mttr: avg(resolved.map((i) => i.resolvedAt!.getTime() - i.startedAt.getTime())),
    count: list.length,
  };
}
