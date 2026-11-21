// One-click JSON backup & restore of a whole workspace.
import { db, json } from "./db";
import { randomToken } from "./crypto";
import { parseMonitorInput } from "./monitorinput";
import { uniqueSlug } from "./auth";
import type { EscalationStep } from "./oncall";

export const BACKUP_VERSION = 1;

export async function exportWorkspace(workspaceId: string) {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const [monitors, channels, policies, pages, incidents, maintenances] = await Promise.all([
    db.monitor.findMany({ where: { workspaceId } }),
    db.alertChannel.findMany({ where: { workspaceId } }),
    db.escalationPolicy.findMany({ where: { workspaceId } }),
    db.statusPage.findMany({ where: { workspaceId }, include: { sections: true, components: true } }),
    db.incident.findMany({ where: { workspaceId }, include: { updates: true, monitors: true } }),
    db.maintenance.findMany({ where: { workspaceId } }),
  ]);
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    workspace: { name: ws.name, incidentPrefix: ws.incidentPrefix, groupingWindowSec: ws.groupingWindowSec },
    monitors: monitors.map((m) => ({ ...m, results: undefined })),
    channels,
    escalationPolicies: policies,
    statusPages: pages.map(({ passwordHash: _p, ...p }) => p),
    incidents,
    maintenances,
  };
}

type Backup = Awaited<ReturnType<typeof exportWorkspace>>;

export async function importWorkspace(workspaceId: string, raw: unknown): Promise<{ monitors: number; pages: number; channels: number; incidents: number }> {
  const data = raw as Partial<Backup>;
  if (!data || typeof data !== "object" || data.version !== BACKUP_VERSION) throw new Error("Not a StatusReport backup (version mismatch)");
  const monitorMap = new Map<string, string>();
  const channelMap = new Map<string, string>();
  const policyMap = new Map<string, string>();

  for (const c of data.channels || []) {
    const created = await db.alertChannel.create({
      data: { workspaceId, name: c.name, type: c.type, visibility: c.visibility, config: c.config, template: c.template, events: c.events, enabled: c.enabled, monitorIds: "[]" },
    });
    channelMap.set(c.id, created.id);
  }
  for (const p of data.escalationPolicies || []) {
    const steps = json<EscalationStep[]>(p.steps, []).map((s) => ({ ...s, channelIds: s.channelIds.map((id) => channelMap.get(id)).filter(Boolean), scheduleId: null }));
    const created = await db.escalationPolicy.create({ data: { workspaceId, name: p.name, steps: JSON.stringify(steps) } });
    policyMap.set(p.id, created.id);
  }
  for (const m of data.monitors || []) {
    const parsed = parseMonitorInput(m as unknown as Record<string, unknown>);
    if ("error" in parsed) continue;
    const created = await db.monitor.create({
      data: {
        ...parsed.data,
        workspaceId,
        authValue: m.authValue,
        escalationPolicyId: m.escalationPolicyId ? policyMap.get(m.escalationPolicyId) ?? null : null,
        heartbeatToken: m.type === "heartbeat" ? randomToken(18) : null,
      },
    });
    monitorMap.set(m.id, created.id);
  }
  // Channel monitor scopes reference monitors, so patch them afterwards.
  for (const c of data.channels || []) {
    const ids = json<string[]>(c.monitorIds, []).map((id) => monitorMap.get(id)).filter(Boolean);
    if (ids.length) await db.alertChannel.update({ where: { id: channelMap.get(c.id)! }, data: { monitorIds: JSON.stringify(ids) } });
  }

  let pages = 0;
  for (const p of data.statusPages || []) {
    const slug = await uniqueSlug(p.slug, async (s) => Boolean(await db.statusPage.findUnique({ where: { slug: s } })));
    const { id: _id, workspaceId: _w, sections, components, customDomain: _cd, domainStatus: _ds, domainVerifiedAt: _dv, domainCheckedAt: _dc, domainError: _de, createdAt: _c, updatedAt: _u, ...rest } = p;
    const page = await db.statusPage.create({ data: { ...rest, slug, workspaceId, visibility: rest.visibility === "password" ? "public" : rest.visibility } });
    const sectionMap = new Map<string, string>();
    for (const s of sections) {
      const created = await db.statusPageSection.create({ data: { statusPageId: page.id, name: s.name, order: s.order, collapsed: s.collapsed } });
      sectionMap.set(s.id, created.id);
    }
    for (const c of components) {
      const monitorId = monitorMap.get(c.monitorId);
      if (!monitorId) continue;
      await db.statusPageComponent.create({
        data: { statusPageId: page.id, monitorId, sectionId: c.sectionId ? sectionMap.get(c.sectionId) ?? null : null, displayName: c.displayName, description: c.description, order: c.order, showLatency: c.showLatency },
      });
    }
    pages++;
  }

  let incidents = 0;
  for (const i of data.incidents || []) {
    const ws = await db.workspace.update({ where: { id: workspaceId }, data: { incidentCounter: { increment: 1 } } });
    await db.incident.create({
      data: {
        workspaceId,
        number: ws.incidentCounter,
        title: i.title,
        status: i.status,
        severity: i.severity,
        auto: false,
        public: i.public,
        cause: i.cause,
        startedAt: new Date(i.startedAt),
        acknowledgedAt: i.acknowledgedAt ? new Date(i.acknowledgedAt) : null,
        resolvedAt: i.resolvedAt ? new Date(i.resolvedAt) : new Date(),
        postmortem: i.postmortem,
        postmortemPublished: i.postmortemPublished,
        updates: { create: i.updates.map((u) => ({ status: u.status, message: u.message, createdAt: new Date(u.createdAt) })) },
        monitors: { create: i.monitors.map((m) => monitorMap.get(m.monitorId)).filter((x): x is string => Boolean(x)).map((monitorId) => ({ monitorId, resolvedAt: new Date() })) },
      },
    });
    incidents++;
  }

  for (const m of data.maintenances || []) {
    if (new Date(m.endsAt) < new Date()) continue;
    await db.maintenance.create({
      data: {
        workspaceId,
        title: m.title,
        description: m.description,
        startsAt: new Date(m.startsAt),
        endsAt: new Date(m.endsAt),
        muteAlerts: m.muteAlerts,
        monitorIds: JSON.stringify(json<string[]>(m.monitorIds, []).map((id) => monitorMap.get(id)).filter(Boolean)),
      },
    });
  }

  return { monitors: monitorMap.size, pages, channels: channelMap.size, incidents };
}
