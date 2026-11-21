// Client-safe notification context helpers (no DB / server imports) so the dashboard
// previews and the landing-page sandbox render exactly what the dispatcher sends.
import type { NotifyContext, NotifyKind } from "./types";

export function emptyContext(kind: NotifyKind, workspaceName = ""): NotifyContext {
  return {
    kind,
    workspace: { name: workspaceName },
    incident: { id: "", number: "", title: "", status: "", severity: "", url: "", dashboard_url: "", ack_url: "", started_at: "" },
    monitor: { name: "", url: "", method: "", protocol: "", type: "" },
    error: { message: "" },
    status_page: { url: "", name: "" },
    duration: "",
    region: "",
    update: { status: "", message: "" },
    latency: { total: "", dns: "", tcp: "", tls: "", ttfb: "" },
    response: { status_code: "", snippet: "" },
    resolved_ip: "",
    escalation: { tier: "" },
    oncall: { mention: "" },
    maintenance: { title: "", description: "", starts_at: "", ends_at: "" },
    expiry: { days: "", kind: "", date: "" },
  };
}

const short = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

/** Sample data for template previews, "Send test payload" and the sandbox. */
export function sampleContext(kind: NotifyKind = "down", appUrl = "https://statusreport.roleflow.site"): NotifyContext {
  const c = emptyContext(kind, "Acme Inc");
  const now = new Date();
  c.incident = {
    id: "MATTE-5",
    number: 5,
    title: "API is down",
    status: kind === "up" ? "resolved" : "investigating",
    severity: "major",
    url: `${appUrl}/s/demo/incidents/5`,
    dashboard_url: `${appUrl}/dashboard/incidents`,
    ack_url: `${appUrl}/dashboard/incidents`,
    started_at: short(now),
  };
  c.monitor = { name: "API", url: "https://api.example.com/health", method: "GET", protocol: "HTTPS", type: "http" };
  c.error = { message: "TLS handshake timed out after 10000ms" };
  c.status_page = { url: `${appUrl}/s/demo`, name: "Acme Status" };
  c.duration = "4m 12s";
  c.region = "eu-west";
  c.update = { status: "Identified", message: "We've identified a misconfigured load balancer and are rolling out a fix." };
  c.latency = { total: 10000, dns: 12, tcp: 31, tls: 9957, ttfb: 0 };
  c.response = { status_code: 503, snippet: '{"error":"upstream connect error"}' };
  c.resolved_ip = "203.0.113.42";
  c.escalation = { tier: 1 };
  c.oncall = { mention: "@on-call" };
  c.maintenance = { title: "Database upgrade", description: "Upgrading Postgres to the latest major version.", starts_at: short(now), ends_at: short(new Date(now.getTime() + 3_600_000)) };
  c.expiry = { days: 7, kind: "SSL certificate", date: short(new Date(now.getTime() + 7 * 86_400_000)) };
  return c;
}
