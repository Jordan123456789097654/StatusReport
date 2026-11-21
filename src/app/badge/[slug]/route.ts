// Live SVG status badge:  ![Status](https://statusreport.roleflow.site/badge/acme.svg)
// Options: ?component=<id>  ?label=uptime  ?style=flat|pill  ?metric=status|uptime
import { escapeHtml } from "@/lib/markdown";
import { loadPublic } from "@/lib/publicroute";
import type { ComponentStatus } from "@/lib/statuspage";

export const dynamic = "force-dynamic";

const COLORS: Record<ComponentStatus, string> = { operational: "#22C55E", degraded: "#F59E0B", partial: "#F97316", major: "#EF4444", maintenance: "#3B82F6" };
const WORDS: Record<ComponentStatus, string> = { operational: "operational", degraded: "degraded", partial: "partial outage", major: "major outage", maintenance: "maintenance" };

function badge(label: string, value: string, color: string, pill: boolean) {
  const w = (t: string) => Math.round(t.length * 6.6 + 14);
  const lw = w(label);
  const vw = w(value);
  const r = pill ? 10 : 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${escapeHtml(label)}: ${escapeHtml(value)}">
<clipPath id="r"><rect width="${lw + vw}" height="20" rx="${r}"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#13161F"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${escapeHtml(label)}</text><text x="${lw + vw / 2}" y="14" fill="#0B0D12" font-weight="bold">${escapeHtml(value)}</text></g></svg>`;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug.replace(/\.svg$/, "");
  const url = new URL(req.url);
  const r = await loadPublic(req, slug);
  if (r instanceof Response) {
    return new Response(badge("status", "unknown", "#5E6372", false), { status: 200, headers: { "content-type": "image/svg+xml" } });
  }
  const compId = url.searchParams.get("component");
  const comp = compId ? r.data.sections.flatMap((s) => s.components).find((c) => c.id === compId) : null;
  const status = comp?.status ?? r.data.overall;
  const metric = url.searchParams.get("metric");
  const value =
    metric === "uptime"
      ? `${(comp?.uptime ?? avg(r.data.sections.flatMap((s) => s.components.map((c) => c.uptime)))).toFixed(2)}%`
      : comp
        ? WORDS[status]
        : status === "operational"
          ? "all systems operational"
          : WORDS[status];
  const label = (url.searchParams.get("label") || (comp ? comp.name : r.page.name)).slice(0, 40);
  return new Response(badge(label, value, COLORS[status], url.searchParams.get("style") === "pill"), {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=60", "access-control-allow-origin": "*" },
  });
}

function avg(list: (number | null)[]) {
  const v = list.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 100;
}
