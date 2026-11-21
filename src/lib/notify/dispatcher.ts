// Fans a single event out to every matching alert channel and status-page subscriber.
import type { AlertChannel, Incident, Maintenance, Monitor, Workspace } from "@prisma/client";
import { db, json } from "../db";
import { env } from "../env";
import { formatDuration, fmtDate } from "../format";
import { protocolLabel, type CheckOutcome } from "../monitoring/types";
import { onCallMention, type EscalationStep } from "../oncall";
import { ackUrl, dashboardIncidentUrl, incidentLabel, statusPageBase } from "../urls";
import { buildDiscordPayload, normalizeTemplate, sendDiscord, type DiscordTemplate, type DiscordVisibility } from "./discord";
import { emailFor, sendEmail, sendGenericWebhook, sendSlack, sendTeams, sendTelegram, summarize } from "./channels";
import { KIND_TO_EVENT, type NotifyContext, type NotifyKind, type SendResult } from "./types";
import { emptyContext } from "./context";

export type NotifyParams = {
  workspaceId: string;
  kind: NotifyKind;
  incidentId?: string;
  monitorId?: string;
  outcome?: CheckOutcome;
  region?: string;
  update?: { status: string; message: string };
  maintenanceId?: string;
  expiry?: { days: number; kind: "SSL certificate" | "Domain"; date: Date };
  /** Only these channels (used by escalation & "send test"). */
  channelIds?: string[];
  escalationTier?: number;
  scheduleId?: string | null;
  privateOnly?: boolean;
};

type ChannelConfig = { url?: string; botToken?: string; chatId?: string; emails?: string; secret?: string };

export { emptyContext, sampleContext } from "./context";

async function buildContext(
  p: NotifyParams,
  ws: Workspace,
  incident: (Incident & { monitors: { monitorId: string }[] }) | null,
  monitor: Monitor | null,
  maintenance: Maintenance | null,
): Promise<NotifyContext> {
  const c = emptyContext(p.kind, ws.name);
  const monitorIds = monitor ? [monitor.id] : incident?.monitors.map((m) => m.monitorId) || json<string[]>(maintenance?.monitorIds, []);
  const page = monitorIds.length
    ? await db.statusPage.findFirst({ where: { workspaceId: ws.id, components: { some: { monitorId: { in: monitorIds } } } } })
    : await db.statusPage.findFirst({ where: { workspaceId: ws.id } });
  if (page) c.status_page = { url: statusPageBase(page), name: page.name };

  if (incident) {
    c.incident = {
      id: incidentLabel(ws.incidentPrefix, incident.number),
      number: incident.number,
      title: incident.title,
      status: incident.status,
      severity: incident.severity,
      url: page ? `${statusPageBase(page)}/incidents/${incident.number}` : "",
      dashboard_url: dashboardIncidentUrl(incident.id),
      ack_url: ackUrl(incident.id),
      started_at: fmtDate(incident.startedAt),
    };
    c.error.message = incident.cause || "";
    if (incident.resolvedAt) c.duration = formatDuration(incident.resolvedAt.getTime() - incident.startedAt.getTime());
  }
  if (monitor) {
    c.monitor = {
      name: monitor.name,
      url: monitor.target,
      method: ["http", "keyword", "json"].includes(monitor.type) ? monitor.method : "",
      protocol: protocolLabel(monitor),
      type: monitor.type,
    };
  }
  const o = p.outcome;
  if (o) {
    if (o.error) c.error.message = o.error;
    c.latency = {
      total: o.latencyMs ?? "",
      dns: o.timings?.dns ?? "",
      tcp: o.timings?.tcp ?? "",
      tls: o.timings?.tls ?? "",
      ttfb: o.timings?.ttfb ?? "",
    };
    c.response = { status_code: o.statusCode ?? "", snippet: o.snippet ?? "" };
    c.resolved_ip = o.ip ?? "";
  }
  c.region = p.region || "";
  if (p.update) c.update = p.update;
  if (maintenance) {
    c.maintenance = { title: maintenance.title, description: maintenance.description, starts_at: fmtDate(maintenance.startsAt), ends_at: fmtDate(maintenance.endsAt) };
  }
  if (p.expiry) c.expiry = { days: p.expiry.days, kind: p.expiry.kind, date: fmtDate(p.expiry.date) };
  c.escalation.tier = p.escalationTier ?? (incident ? incident.escalationStep + 1 : "");
  if (p.scheduleId) c.oncall.mention = (await onCallMention(p.scheduleId)).mention;
  return c;
}

export async function sendToChannel(ch: AlertChannel, kind: NotifyKind, ctx: NotifyContext): Promise<SendResult> {
  const cfg = json<ChannelConfig>(ch.config, {});
  const visibility = (ch.visibility === "public" ? "public" : "private") as DiscordVisibility;
  switch (ch.type) {
    case "discord": {
      const tpl = normalizeTemplate(json<Partial<DiscordTemplate> | null>(ch.template, null), visibility);
      return sendDiscord(cfg.url || "", buildDiscordPayload(tpl, visibility, kind, ctx));
    }
    case "slack":
      return sendSlack(cfg.url || "", summarize(kind, ctx));
    case "teams":
      return sendTeams(cfg.url || "", summarize(kind, ctx));
    case "telegram":
      return sendTelegram(cfg.botToken || "", cfg.chatId || "", summarize(kind, ctx));
    case "email": {
      const e = emailFor(summarize(kind, ctx));
      return sendEmail((cfg.emails || "").split(","), e.subject, e.html, e.text);
    }
    case "webhook":
      return sendGenericWebhook(cfg.url || "", kind, ctx, ch.template, cfg.secret);
  }
  return { ok: false, error: `Unknown channel type ${ch.type}` };
}

export async function notify(p: NotifyParams): Promise<void> {
  const ws = await db.workspace.findUnique({ where: { id: p.workspaceId } });
  if (!ws) return;
  const incident = p.incidentId ? await db.incident.findUnique({ where: { id: p.incidentId }, include: { monitors: true } }) : null;
  const monitor = p.monitorId
    ? await db.monitor.findUnique({ where: { id: p.monitorId } })
    : incident?.monitors[0]
      ? await db.monitor.findUnique({ where: { id: incident.monitors[0].monitorId } })
      : null;
  const maintenance = p.maintenanceId ? await db.maintenance.findUnique({ where: { id: p.maintenanceId } }) : null;

  // Muted by an active maintenance window?
  if (monitor?.inMaintenance && ["down", "up", "grouped"].includes(p.kind)) {
    const active = await db.maintenance.findMany({ where: { workspaceId: ws.id, status: "in_progress", muteAlerts: true } });
    if (active.some((m) => json<string[]>(m.monitorIds, []).includes(monitor.id))) return;
  }

  // Escalation policy: the first "down" alert only goes to step 0 (plus public channels).
  let channelIds = p.channelIds;
  let scheduleId = p.scheduleId;
  let tier = p.escalationTier;
  if (!channelIds && p.kind === "down" && monitor?.escalationPolicyId) {
    const policy = await db.escalationPolicy.findUnique({ where: { id: monitor.escalationPolicyId } });
    const steps = json<EscalationStep[]>(policy?.steps, []);
    if (steps[0]) {
      const publicIds = (await db.alertChannel.findMany({ where: { workspaceId: ws.id, visibility: "public", enabled: true }, select: { id: true } })).map((c) => c.id);
      channelIds = [...new Set([...steps[0].channelIds, ...publicIds])];
      scheduleId = steps[0].scheduleId;
      tier = 1;
    }
  }

  const ctx = await buildContext({ ...p, scheduleId, escalationTier: tier }, ws, incident, monitor, maintenance);
  const event = KIND_TO_EVENT[p.kind];
  const channels = await db.alertChannel.findMany({
    where: { workspaceId: ws.id, enabled: true, ...(channelIds ? { id: { in: channelIds } } : {}) },
  });

  const targets = channels.filter((ch) => {
    if (!channelIds && !ch.events.split(",").includes(event)) return false;
    const scope = json<string[]>(ch.monitorIds, []);
    if (scope.length && monitor && !scope.includes(monitor.id)) return false;
    if (ch.visibility === "public") {
      if (p.privateOnly || p.kind === "grouped" || p.kind === "expiry") return false;
      if (incident && !incident.public) return false;
    }
    return true;
  });

  await Promise.all(
    targets.map(async (ch) => {
      const res = await sendToChannel(ch, p.kind, ctx);
      await db.notificationLog.create({
        data: { workspaceId: ws.id, channelId: ch.id, incidentId: incident?.id, kind: p.kind, ok: res.ok, error: res.error?.slice(0, 500) },
      });
      if (!res.ok) console.warn(`[notify] ${ch.type}:${ch.name} failed: ${res.error}`);
    }),
  );

  if (!p.privateOnly && !p.channelIds && ["down", "up", "update", "maintenance"].includes(p.kind) && (!incident || incident.public)) {
    await notifySubscribers(ws.id, p.kind, ctx, incident?.monitors.map((m) => m.monitorId) ?? (monitor ? [monitor.id] : json<string[]>(maintenance?.monitorIds, [])));
  }
}

async function notifySubscribers(workspaceId: string, kind: NotifyKind, ctx: NotifyContext, monitorIds: string[]) {
  const pages = await db.statusPage.findMany({
    where: { workspaceId, subscribersEnabled: true, ...(monitorIds.length ? { components: { some: { monitorId: { in: monitorIds } } } } : {}) },
    include: { components: true, subscribers: { where: { confirmed: true } } },
  });
  for (const page of pages) {
    const affected = page.components.filter((c) => monitorIds.includes(c.monitorId)).map((c) => c.id);
    const base = statusPageBase(page);
    const pageCtx: NotifyContext = { ...ctx, status_page: { url: base, name: page.name } };
    for (const sub of page.subscribers) {
      const wanted = json<string[]>(sub.componentIds, []);
      if (wanted.length && affected.length && !wanted.some((id) => affected.includes(id))) continue;
      const unsubscribe = `${env.appUrl}/api/v1/subscribe/unsubscribe?token=${sub.token}`;
      let res: SendResult;
      if (sub.type === "email") {
        const e = emailFor(summarize(kind, pageCtx), `<p style="color:#6B7080;font-size:12px;margin-top:18px">You're subscribed to ${page.name}. <a style="color:#8B90A0" href="${unsubscribe}">Unsubscribe</a></p>`);
        res = await sendEmail([sub.target], e.subject, e.html, `${e.text}\n\nUnsubscribe: ${unsubscribe}`);
      } else if (sub.type === "discord") {
        res = await sendDiscord(sub.target, buildDiscordPayload(normalizeTemplate(null, "public"), "public", kind, pageCtx));
      } else {
        res = await sendGenericWebhook(sub.target, kind, pageCtx, null);
      }
      if (!res.ok) console.warn(`[subscribers] ${sub.type} ${sub.id} failed: ${res.error}`);
    }
  }
}
