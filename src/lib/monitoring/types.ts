import type { Monitor } from "@prisma/client";

export type MonitorType = "http" | "keyword" | "json" | "tcp" | "udp" | "ping" | "dns" | "ssl" | "domain" | "heartbeat";

export const MONITOR_TYPES: { value: MonitorType; label: string; hint: string }[] = [
  { value: "http", label: "HTTP(S)", hint: "Status code check for any URL and method" },
  { value: "keyword", label: "Keyword", hint: "Response body must (not) contain a string" },
  { value: "json", label: "JSON path", hint: "Assert on a JSON value, e.g. $.status == \"healthy\"" },
  { value: "tcp", label: "TCP port", hint: "Databases, game servers, SMTP…" },
  { value: "udp", label: "UDP port", hint: "Send a datagram and watch for errors / replies" },
  { value: "ping", label: "ICMP ping", hint: "Host reachability" },
  { value: "dns", label: "DNS records", hint: "A / AAAA / CNAME / MX / TXT / NS drift" },
  { value: "ssl", label: "SSL certificate", hint: "Chain validity and expiry" },
  { value: "domain", label: "Domain expiry", hint: "Registration expiry via RDAP/WHOIS" },
  { value: "heartbeat", label: "Heartbeat / cron", hint: "Your job pings us; alert when it goes quiet" },
];

export type Timings = { dns: number; tcp: number; tls: number; ttfb: number };

export type CheckOutcome = {
  ok: boolean;
  status: "up" | "down" | "degraded";
  statusCode?: number;
  latencyMs?: number;
  timings?: Timings;
  error?: string;
  snippet?: string;
  ip?: string;
  ssl?: { expiresAt: Date; issuer: string; daysLeft: number };
  domainExpiresAt?: Date;
  /** Days until SSL/domain expiry, used for threshold alerts. */
  expiryDaysLeft?: number;
};

export type MonitorRow = Monitor;

export const down = (error: string, extra: Partial<CheckOutcome> = {}): CheckOutcome => ({
  ok: false,
  status: "down",
  error,
  ...extra,
});

export const up = (extra: Partial<CheckOutcome> = {}): CheckOutcome => ({ ok: true, status: "up", ...extra });

export function protocolLabel(m: Pick<Monitor, "type" | "target">): string {
  if (["http", "keyword", "json"].includes(m.type)) return m.target.startsWith("https") ? "HTTPS" : "HTTP";
  return m.type.toUpperCase();
}

export function parseHostPort(target: string, fallbackPort?: number | null): { host: string; port: number } {
  const t = target.replace(/^[a-z]+:\/\//i, "").replace(/\/.*$/, "");
  const v6 = t.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (v6) return { host: v6[1], port: Number(v6[2] || fallbackPort || 0) };
  const idx = t.lastIndexOf(":");
  if (idx > 0 && t.indexOf(":") === idx) return { host: t.slice(0, idx), port: Number(t.slice(idx + 1)) };
  return { host: t, port: Number(fallbackPort || 0) };
}
