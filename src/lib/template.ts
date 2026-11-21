// Tiny `{{ dotted.path }}` template renderer used by Discord, webhook and email templates.
export type TemplateContext = Record<string, unknown>;

export function lookup(ctx: unknown, path: string): unknown {
  let cur: unknown = ctx;
  for (const part of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function renderTemplate(tpl: string, ctx: TemplateContext): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const v = lookup(ctx, path);
    if (v == null) return "";
    return typeof v === "object" ? JSON.stringify(v) : String(v);
  });
}

/** Render every string leaf of a JSON-like value. */
export function renderDeep<T>(value: T, ctx: TemplateContext): T {
  if (typeof value === "string") return renderTemplate(value, ctx) as T;
  if (Array.isArray(value)) return value.map((v) => renderDeep(v, ctx)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = renderDeep(v, ctx);
    return out as T;
  }
  return value;
}

export const TEMPLATE_VARIABLES = [
  "incident.id",
  "incident.number",
  "incident.title",
  "incident.status",
  "incident.severity",
  "incident.url",
  "incident.dashboard_url",
  "incident.ack_url",
  "incident.started_at",
  "monitor.name",
  "monitor.url",
  "monitor.method",
  "monitor.protocol",
  "monitor.type",
  "error.message",
  "status_page.url",
  "status_page.name",
  "duration",
  "region",
  "update.status",
  "update.message",
  "latency.total",
  "latency.dns",
  "latency.tcp",
  "latency.tls",
  "latency.ttfb",
  "response.status_code",
  "response.snippet",
  "resolved_ip",
  "escalation.tier",
  "oncall.mention",
  "workspace.name",
] as const;
