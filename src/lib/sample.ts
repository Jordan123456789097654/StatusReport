// Client-safe demo data for the landing-page sandbox and docs. No database access.
import { DEFAULT_BAR_CONFIG, DEFAULT_BLOCKS } from "./blocks";
import { getStrings } from "./i18n";
import type { ComponentView, DayBar, LatencyPoint, PageConfig, ViewData } from "./statuspage";
import { resolveTokens } from "./themes";

function bars(seed: number, days: number): DayBar[] {
  const out: DayBar[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const r = Math.abs(Math.sin(seed * 9301 + i * 49297) * 233280) % 1;
    const dayDate = new Date(Date.now() - i * 86_400_000);
    const day = dayDate.toISOString().slice(0, 10);
    if (r > 0.97) out.push({ day, uptime: 97.8 + r, incidents: 1, status: "down" });
    else if (r > 0.93) out.push({ day, uptime: 99.6, incidents: 1, status: "degraded" });
    else out.push({ day, uptime: 99.95 + r / 100, incidents: 0, status: "up" });
  }
  return out;
}

function latency(seed: number): LatencyPoint[] {
  const now = Date.now();
  const pts: LatencyPoint[] = [];
  for (let i = 47; i >= 0; i--) {
    const v = 120 + Math.round(40 * Math.abs(Math.sin(seed + i * 0.6))) + (i % 13 === 0 ? 180 : 0);
    pts.push({ t: now - i * 1_800_000, v });
  }
  return pts;
}

const COMPONENTS: { id: string; name: string; description: string; seed: number }[] = [
  { id: "api", name: "API", description: "Public REST API and webhooks", seed: 1.3 },
  { id: "dash", name: "Dashboard", description: "Web app and login", seed: 2.1 },
  { id: "db", name: "Database", description: "Primary Postgres cluster", seed: 3.7 },
  { id: "cdn", name: "CDN & assets", description: "Images and static files", seed: 4.2 },
];

export function sampleViewData(): ViewData {
  const comps: ComponentView[] = COMPONENTS.map((c) => {
    const b = bars(c.seed, 90);
    const ups = b.filter((x) => x.uptime != null).map((x) => x.uptime as number);
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      status: "operational",
      uptime: ups.reduce((a, v) => a + v, 0) / ups.length,
      bars: b,
      showLatency: true,
      latency: latency(c.seed),
      deployments: [],
    };
  });
  return {
    pageId: "demo",
    slug: "demo",
    baseUrl: "https://statusreport.roleflow.site/s/demo",
    overall: "operational",
    sections: [{ id: "main", name: "", collapsed: false, status: "operational", components: comps }],
    activeIncidents: [],
    history: [],
    maintenances: [],
    generatedAt: new Date().toISOString(),
  };
}

export function sampleConfig(theme = "betterstack-dark"): PageConfig {
  return {
    name: "Acme Status",
    description: "Live status for Acme's products and services.",
    logoUrl: null,
    websiteUrl: "https://example.com",
    theme,
    tokens: resolveTokens(theme, {}),
    blocks: DEFAULT_BLOCKS,
    bars: DEFAULT_BAR_CONFIG,
    showLatency: true,
    locale: "en",
    strings: getStrings("en"),
    subscribersEnabled: true,
    reportIssueEnabled: true,
    customCss: "",
    customHeader: "",
    customFooter: "",
  };
}
