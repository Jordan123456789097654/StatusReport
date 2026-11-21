// status.json (Atlassian Statuspage-compatible), RSS and Atom builders.
import type { StatusPage } from "@prisma/client";
import { escapeHtml } from "./markdown";
import type { ComponentStatus, ViewData } from "./statuspage";

const ATLASSIAN_COMPONENT: Record<ComponentStatus, string> = {
  operational: "operational",
  degraded: "degraded_performance",
  partial: "partial_outage",
  major: "major_outage",
  maintenance: "under_maintenance",
};
const ATLASSIAN_INDICATOR: Record<ComponentStatus, string> = {
  operational: "none",
  degraded: "minor",
  partial: "major",
  major: "critical",
  maintenance: "maintenance",
};
const DESCRIPTION: Record<ComponentStatus, string> = {
  operational: "All Systems Operational",
  degraded: "Degraded Performance",
  partial: "Partial System Outage",
  major: "Major System Outage",
  maintenance: "Under Maintenance",
};

export function statusJson(page: StatusPage, d: ViewData) {
  const incidents = [...d.activeIncidents, ...d.history];
  return {
    page: { id: page.id, name: page.name, url: d.baseUrl, time_zone: "Etc/UTC", updated_at: d.generatedAt },
    status: { indicator: ATLASSIAN_INDICATOR[d.overall], description: DESCRIPTION[d.overall] },
    components: d.sections.flatMap((s) => [
      ...(s.name ? [{ id: s.id, name: s.name, status: ATLASSIAN_COMPONENT[s.status], group: true, group_id: null, components: s.components.map((c) => c.id) }] : []),
      ...s.components.map((c, i) => ({
        id: c.id,
        name: c.name,
        description: c.description || null,
        status: ATLASSIAN_COMPONENT[c.status],
        position: i + 1,
        group: false,
        group_id: s.name ? s.id : null,
        uptime_percentage: c.uptime == null ? null : Number(c.uptime.toFixed(4)),
      })),
    ]),
    incidents: incidents.map((i) => ({
      id: i.id,
      name: i.title,
      status: i.status,
      impact: i.severity === "degraded" ? "minor" : i.severity === "partial" ? "major" : i.severity === "maintenance" ? "maintenance" : "critical",
      shortlink: `${d.baseUrl}/incidents/${i.number}`,
      created_at: i.startedAt,
      resolved_at: i.resolvedAt,
      incident_updates: i.updates.map((u) => ({ status: u.status, body: u.html.replace(/<[^>]+>/g, ""), created_at: u.createdAt })),
    })),
    scheduled_maintenances: d.maintenances.map((m) => ({
      id: m.id,
      name: m.title,
      status: m.status,
      scheduled_for: m.startsAt,
      scheduled_until: m.endsAt,
      description: m.description,
    })),
  };
}

const x = escapeHtml;

export function rss(page: StatusPage, d: ViewData): string {
  const items = [...d.activeIncidents, ...d.history]
    .map((i) => {
      const link = `${d.baseUrl}/incidents/${i.number}`;
      const body = i.updates.map((u) => `<p><strong>${x(u.status)}</strong>: ${u.html}</p>`).join("");
      return `<item><title>${x(i.title)}</title><link>${x(link)}</link><guid isPermaLink="true">${x(link)}</guid><pubDate>${new Date(i.updates[0]?.createdAt || i.startedAt).toUTCString()}</pubDate><description><![CDATA[${body}]]></description></item>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${x(page.name)} status</title><link>${x(d.baseUrl)}</link><atom:link href="${x(d.baseUrl)}/feed.rss" rel="self" type="application/rss+xml"/><description>Incident history for ${x(page.name)}</description><lastBuildDate>${new Date(d.generatedAt).toUTCString()}</lastBuildDate>${items}</channel></rss>`;
}

export function atom(page: StatusPage, d: ViewData): string {
  const entries = [...d.activeIncidents, ...d.history]
    .map((i) => {
      const link = `${d.baseUrl}/incidents/${i.number}`;
      const body = i.updates.map((u) => `<p><strong>${x(u.status)}</strong>: ${u.html}</p>`).join("");
      return `<entry><id>${x(link)}</id><title>${x(i.title)}</title><link href="${x(link)}"/><updated>${i.updates[0]?.createdAt || i.startedAt}</updated><published>${i.startedAt}</published><content type="html">${x(body)}</content></entry>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${x(d.baseUrl)}</id><title>${x(page.name)} status</title><link href="${x(d.baseUrl)}"/><link rel="self" href="${x(d.baseUrl)}/feed.atom"/><updated>${d.generatedAt}</updated>${entries}</feed>`;
}
