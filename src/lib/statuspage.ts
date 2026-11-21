// Builds the read model for a public status page. Shared by the page itself, status.json,
// RSS/Atom feeds, SVG badges, OG images and the worker's static snapshots.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StatusPage } from "@prisma/client";
import { db, json } from "./db";
import { dayKey } from "./format";
import { renderMarkdown } from "./markdown";
import { resolveBarConfig, resolveBlocks, type BarConfig, type Block } from "./blocks";
import { resolveTokens, type Tokens } from "./themes";
import { getStrings, type Strings } from "./i18n";
import { incidentLabel, statusPageBase } from "./urls";

export type ComponentStatus = "operational" | "degraded" | "partial" | "major" | "maintenance";
export const STATUS_RANK: Record<ComponentStatus, number> = { operational: 0, maintenance: 1, degraded: 2, partial: 3, major: 4 };

export type DayBar = { day: string; uptime: number | null; incidents: number; status: "up" | "degraded" | "down" | "nodata" };
export type LatencyPoint = { t: number; v: number };
export type ComponentView = {
  id: string;
  name: string;
  description: string;
  status: ComponentStatus;
  uptime: number | null;
  bars: DayBar[];
  showLatency: boolean;
  latency: LatencyPoint[];
  deployments: { t: number; label: string }[];
};
export type SectionView = { id: string; name: string; collapsed: boolean; status: ComponentStatus; components: ComponentView[] };
export type IncidentView = {
  id: string;
  number: number;
  label: string;
  title: string;
  status: string;
  severity: string;
  startedAt: string;
  resolvedAt: string | null;
  affected: string[];
  updates: { status: string; html: string; createdAt: string }[];
  postmortemHtml: string | null;
};
export type MaintenanceView = { id: string; title: string; description: string; startsAt: string; endsAt: string; status: string };

export type PageConfig = {
  name: string;
  description: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  theme: string;
  tokens: Tokens;
  blocks: Block[];
  bars: BarConfig;
  showLatency: boolean;
  locale: string;
  strings: Strings;
  subscribersEnabled: boolean;
  reportIssueEnabled: boolean;
  customCss: string;
  customHeader: string;
  customFooter: string;
};

export type ViewData = {
  pageId: string;
  slug: string;
  baseUrl: string;
  overall: ComponentStatus;
  sections: SectionView[];
  activeIncidents: IncidentView[];
  history: IncidentView[];
  maintenances: MaintenanceView[];
  generatedAt: string;
  snapshot?: boolean;
};

export function pageConfig(p: StatusPage, localeOverride?: string): PageConfig {
  const locale = localeOverride || p.locale;
  return {
    name: p.name,
    description: p.description,
    logoUrl: p.logoUrl,
    websiteUrl: p.websiteUrl,
    theme: p.theme,
    tokens: resolveTokens(p.theme, json(p.tokens, {})),
    blocks: resolveBlocks(json<Block[]>(p.blocks, [])),
    bars: resolveBarConfig(json(p.barConfig, {})),
    showLatency: p.showLatency,
    locale,
    strings: getStrings(locale, json(p.strings, {})),
    subscribersEnabled: p.subscribersEnabled,
    reportIssueEnabled: p.reportIssueEnabled,
    customCss: p.customCss,
    customHeader: p.customHeader,
    customFooter: p.customFooter,
  };
}

/** Resolve "/s/{slug}" params, or "@{host}" injected by the custom-domain middleware. */
export async function findPage(slugOrHost: string) {
  const s = decodeURIComponent(slugOrHost).toLowerCase();
  if (s.startsWith("@")) {
    return db.statusPage.findFirst({ where: { customDomain: s.slice(1), domainStatus: "verified" } });
  }
  return db.statusPage.findUnique({ where: { slug: s } });
}

function monitorStatus(m: { status: string; inMaintenance: boolean }): ComponentStatus {
  if (m.inMaintenance) return "maintenance";
  if (m.status === "down") return "major";
  if (m.status === "degraded") return "degraded";
  return "operational";
}

const SEVERITY_TO_STATUS: Record<string, ComponentStatus> = { degraded: "degraded", partial: "partial", major: "major", maintenance: "maintenance" };

const worst = (list: ComponentStatus[]): ComponentStatus =>
  list.reduce<ComponentStatus>((a, b) => (STATUS_RANK[b] > STATUS_RANK[a] ? b : a), "operational");

function toIncidentView(
  i: { id: string; number: number; title: string; status: string; severity: string; startedAt: Date; resolvedAt: Date | null; postmortem: string | null; postmortemPublished: boolean; monitors: { monitorId: string }[]; updates: { status: string; message: string; createdAt: Date }[] },
  prefix: string,
  names: Map<string, string>,
): IncidentView {
  return {
    id: i.id,
    number: i.number,
    label: incidentLabel(prefix, i.number),
    title: i.title,
    status: i.status,
    severity: i.severity,
    startedAt: i.startedAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    affected: i.monitors.map((m) => names.get(m.monitorId)).filter((n): n is string => Boolean(n)),
    updates: [...i.updates]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((u) => ({ status: u.status, html: renderMarkdown(u.message), createdAt: u.createdAt.toISOString() })),
    postmortemHtml: i.postmortemPublished && i.postmortem ? renderMarkdown(i.postmortem) : null,
  };
}

export async function loadViewData(page: StatusPage, opts: { historyDays?: number } = {}): Promise<ViewData> {
  const bars = resolveBarConfig(json(page.barConfig, {}));
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: page.workspaceId } });
  const [sections, components] = await Promise.all([
    db.statusPageSection.findMany({ where: { statusPageId: page.id }, orderBy: { order: "asc" } }),
    db.statusPageComponent.findMany({ where: { statusPageId: page.id }, orderBy: { order: "asc" }, include: { monitor: true } }),
  ]);
  const monitorIds = components.map((c) => c.monitorId);
  const names = new Map(components.map((c) => [c.monitorId, c.displayName || c.monitor.name]));

  const since = new Date(Date.now() - (bars.days - 1) * 86_400_000);
  const sinceDay = dayKey(since);
  const dayAgo = new Date(Date.now() - 86_400_000);
  const historyFrom = new Date(Date.now() - (opts.historyDays ?? 30) * 86_400_000);

  const [stats, results, incidents, maints, deployments] = await Promise.all([
    db.dailyStat.findMany({ where: { monitorId: { in: monitorIds }, day: { gte: sinceDay } } }),
    page.showLatency
      ? db.checkResult.findMany({
          where: { monitorId: { in: monitorIds }, createdAt: { gte: dayAgo }, ok: true, latencyMs: { not: null } },
          select: { monitorId: true, createdAt: true, latencyMs: true },
          orderBy: { createdAt: "asc" },
          take: 20_000,
        })
      : Promise.resolve([]),
    db.incident.findMany({
      where: {
        workspaceId: page.workspaceId,
        public: true,
        OR: [{ resolvedAt: null }, { startedAt: { gte: since < historyFrom ? since : historyFrom } }],
        monitors: { some: { monitorId: { in: monitorIds } } },
      },
      include: { monitors: true, updates: true },
      orderBy: { startedAt: "desc" },
      take: 200,
    }),
    db.maintenance.findMany({
      where: { workspaceId: page.workspaceId, status: { in: ["scheduled", "in_progress"] }, endsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
    }),
    db.deployment.findMany({ where: { workspaceId: page.workspaceId, createdAt: { gte: dayAgo } }, orderBy: { createdAt: "asc" } }),
  ]);

  const statsBy = new Map<string, Map<string, (typeof stats)[number]>>();
  for (const s of stats) {
    if (!statsBy.has(s.monitorId)) statsBy.set(s.monitorId, new Map());
    statsBy.get(s.monitorId)!.set(s.day, s);
  }
  const incidentDays = new Map<string, Map<string, number>>();
  const openSeverity = new Map<string, ComponentStatus>();
  for (const i of incidents) {
    const d = dayKey(i.startedAt);
    for (const m of i.monitors) {
      if (!incidentDays.has(m.monitorId)) incidentDays.set(m.monitorId, new Map());
      const map = incidentDays.get(m.monitorId)!;
      map.set(d, (map.get(d) || 0) + 1);
      if (!i.resolvedAt && !m.resolvedAt) {
        const sev = SEVERITY_TO_STATUS[i.severity] || "major";
        const cur = openSeverity.get(m.monitorId);
        if (!cur || STATUS_RANK[sev] > STATUS_RANK[cur]) openSeverity.set(m.monitorId, sev);
      }
    }
  }

  const days: string[] = [];
  for (let i = bars.days - 1; i >= 0; i--) days.push(dayKey(new Date(Date.now() - i * 86_400_000)));

  const buildComponent = (c: (typeof components)[number]): ComponentView => {
    const ms = statsBy.get(c.monitorId);
    let up = 0;
    let total = 0;
    const barList: DayBar[] = days.map((day) => {
      const s = ms?.get(day);
      const inc = incidentDays.get(c.monitorId)?.get(day) || 0;
      if (!s || !s.total) return { day, uptime: null, incidents: inc, status: inc ? "degraded" : "nodata" };
      up += s.up;
      total += s.total;
      const u = (s.up / s.total) * 100;
      const status = u >= bars.upThreshold ? (inc ? "degraded" : "up") : u >= bars.degradedThreshold ? "degraded" : "down";
      return { day, uptime: u, incidents: inc, status };
    });
    const own = monitorStatus(c.monitor);
    const sev = openSeverity.get(c.monitorId);
    // A human-set incident severity wins over the raw monitor state.
    const status = sev ?? own;

    // 24h latency, bucketed into 48 half-hour points.
    const pts = results.filter((r) => r.monitorId === c.monitorId);
    const buckets = new Map<number, { sum: number; n: number }>();
    for (const r of pts) {
      const b = Math.floor(r.createdAt.getTime() / 1_800_000) * 1_800_000;
      const cur = buckets.get(b) || { sum: 0, n: 0 };
      cur.sum += r.latencyMs || 0;
      cur.n++;
      buckets.set(b, cur);
    }
    const latency = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v: Math.round(v.sum / v.n) }));

    return {
      id: c.id,
      name: c.displayName || c.monitor.name,
      description: c.description || "",
      status,
      uptime: total ? (up / total) * 100 : null,
      bars: barList,
      showLatency: page.showLatency && c.showLatency,
      latency,
      deployments: deployments
        .filter((d) => !d.monitorId || d.monitorId === c.monitorId)
        .map((d) => ({ t: d.createdAt.getTime(), label: `${d.version}${d.environment ? ` (${d.environment})` : ""}` })),
    };
  };

  const sectionViews: SectionView[] = [];
  const loose = components.filter((c) => !c.sectionId || !sections.some((s) => s.id === c.sectionId));
  if (loose.length) {
    const comps = loose.map(buildComponent);
    sectionViews.push({ id: "default", name: "", collapsed: false, status: worst(comps.map((c) => c.status)), components: comps });
  }
  for (const s of sections) {
    const comps = components.filter((c) => c.sectionId === s.id).map(buildComponent);
    if (!comps.length) continue;
    sectionViews.push({ id: s.id, name: s.name, collapsed: s.collapsed, status: worst(comps.map((c) => c.status)), components: comps });
  }

  const relevantMaint = maints.filter((m) => {
    const ids = json<string[]>(m.monitorIds, []);
    return !ids.length || ids.some((id) => monitorIds.includes(id));
  });

  const all = sectionViews.flatMap((s) => s.components.map((c) => c.status));
  let overall = worst(all);
  if (overall === "operational" && relevantMaint.some((m) => m.status === "in_progress")) overall = "maintenance";

  const views = incidents.map((i) => toIncidentView(i, ws.incidentPrefix, names));
  return {
    pageId: page.id,
    slug: page.slug,
    baseUrl: statusPageBase(page),
    overall,
    sections: sectionViews,
    activeIncidents: views.filter((i) => !i.resolvedAt),
    history: views.filter((i) => i.resolvedAt && new Date(i.startedAt) >= historyFrom),
    maintenances: relevantMaint.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      startsAt: m.startsAt.toISOString(),
      endsAt: m.endsAt.toISOString(),
      status: m.status,
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function loadIncident(page: StatusPage, number: number): Promise<IncidentView | null> {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: page.workspaceId } });
  const comps = await db.statusPageComponent.findMany({ where: { statusPageId: page.id }, include: { monitor: true } });
  const ids = comps.map((c) => c.monitorId);
  const i = await db.incident.findFirst({
    where: { workspaceId: page.workspaceId, number, public: true, monitors: { some: { monitorId: { in: ids } } } },
    include: { monitors: true, updates: true },
  });
  if (!i) return null;
  return toIncidentView(i, ws.incidentPrefix, new Map(comps.map((c) => [c.monitorId, c.displayName || c.monitor.name])));
}

// ── Static fallback / disaster mode ──────────────────────────────────────────
const SNAP_DIR = path.join(process.cwd(), "data", "snapshots");

/** Only public pages are snapshotted; secrets are stripped before writing to disk. */
export async function writeSnapshot(page: StatusPage, data: ViewData) {
  if (page.visibility !== "public") return;
  await mkdir(SNAP_DIR, { recursive: true });
  const safePage = { ...page, passwordHash: null, ipAllowlist: "" };
  await writeFile(path.join(SNAP_DIR, `slug-${page.slug}.json`), JSON.stringify({ page: safePage, data }));
}

export async function readSnapshot(slugOrHost: string): Promise<{ page: StatusPage; data: ViewData } | null> {
  const key = decodeURIComponent(slugOrHost).toLowerCase();
  if (key.startsWith("@") || !/^[a-z0-9-]+$/.test(key)) return null;
  try {
    const raw = JSON.parse(await readFile(path.join(SNAP_DIR, `slug-${key}.json`), "utf8"));
    raw.page.createdAt = new Date(raw.page.createdAt);
    raw.page.updatedAt = new Date(raw.page.updatedAt);
    return { page: raw.page, data: { ...raw.data, snapshot: true } };
  } catch {
    return null;
  }
}
