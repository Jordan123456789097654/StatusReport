// One validator for monitor definitions, shared by the dashboard form, REST API,
// YAML/JSON config sync and backup import.
import type { Prisma } from "@prisma/client";
import { MONITOR_TYPES, type MonitorType } from "./monitoring/types";

export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
export const ALLOWED_INTERVALS = [10, 30, 60, 180, 300, 900, 3600];
const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS"];
const JSON_OPS = ["==", "!=", ">", "<", ">=", "<=", "contains", "exists"];

export type MonitorInput = Omit<Prisma.MonitorUncheckedCreateInput, "workspaceId">;

const s = (v: unknown) => (v == null ? "" : String(v).trim());
const n = (v: unknown, d: number) => {
  const x = Number(v);
  return v === "" || v == null || !Number.isFinite(x) ? d : x;
};
const b = (v: unknown, d: boolean) => (v === undefined || v === null || v === "" ? d : v === true || v === "true" || v === "on" || v === 1 || v === "1");
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(x)));

/** Validate + normalise. `partial` = only touch keys that are present (PATCH). */
export function parseMonitorInput(raw: Record<string, unknown>, partial = false): { data: MonitorInput } | { error: string } {
  const has = (k: string) => !partial || k in raw;
  const out: Record<string, unknown> = {};

  if (has("name")) {
    const name = s(raw.name);
    if (!name || name.length > 120) return { error: "Name is required (max 120 characters)" };
    out.name = name;
  }
  const type = (has("type") ? s(raw.type) || "http" : undefined) as MonitorType | undefined;
  if (type !== undefined) {
    if (!MONITOR_TYPES.some((t) => t.value === type)) return { error: `Unknown monitor type "${type}"` };
    out.type = type;
  }
  if (has("target")) {
    const target = s(raw.target);
    const t = type ?? "http";
    if (t !== "heartbeat" && !target) return { error: "Target is required" };
    if (["http", "keyword", "json"].includes(t)) {
      try {
        const u = new URL(target);
        if (!["http:", "https:"].includes(u.protocol)) throw new Error();
      } catch {
        return { error: "Target must be a full http:// or https:// URL" };
      }
    }
    if (target.length > 2000) return { error: "Target is too long" };
    out.target = target;
  }
  if (has("method")) {
    const m = s(raw.method).toUpperCase() || "GET";
    if (!METHODS.includes(m as (typeof METHODS)[number])) return { error: `Unsupported method ${m}` };
    out.method = m;
  }
  if (has("headers")) {
    let h: unknown = raw.headers ?? {};
    if (typeof h === "string") {
      if (!h.trim()) h = {};
      else {
        try {
          h = JSON.parse(h);
        } catch {
          // Also accept "Header: value" lines.
          const obj: Record<string, string> = {};
          for (const line of String(raw.headers).split(/\r?\n/)) {
            const i = line.indexOf(":");
            if (i > 0) obj[line.slice(0, i).trim()] = line.slice(i + 1).trim();
          }
          h = obj;
        }
      }
    }
    if (typeof h !== "object" || Array.isArray(h) || h === null) return { error: "Headers must be a JSON object" };
    out.headers = JSON.stringify(h);
  }
  if (has("body")) out.body = s(raw.body) || null;
  if (has("bodyType")) out.bodyType = ["json", "form", "raw"].includes(s(raw.bodyType)) ? s(raw.bodyType) : "json";
  if (has("authType")) out.authType = ["none", "bearer", "basic"].includes(s(raw.authType)) ? s(raw.authType) : "none";
  if (has("authValue")) out.authValue = s(raw.authValue) || null;
  if (has("expectedStatus")) {
    const e = s(raw.expectedStatus) || "200-299";
    if (!/^(\s*(\d{3}(\s*-\s*\d{3})?|\dxx)\s*)(,\s*(\d{3}(\s*-\s*\d{3})?|\dxx)\s*)*$/i.test(e)) return { error: "Expected status must look like 200-299,301" };
    out.expectedStatus = e;
  }
  if (has("followRedirects")) out.followRedirects = b(raw.followRedirects, true);
  if (has("keyword")) out.keyword = s(raw.keyword) || null;
  if (has("keywordMode")) out.keywordMode = s(raw.keywordMode) === "absent" ? "absent" : "present";
  if (has("jsonPath")) {
    const p = s(raw.jsonPath);
    if (p && !p.startsWith("$")) return { error: "JSONPath must start with $" };
    out.jsonPath = p || null;
  }
  if (has("jsonOp")) out.jsonOp = JSON_OPS.includes(s(raw.jsonOp)) ? s(raw.jsonOp) : "==";
  if (has("jsonExpected")) out.jsonExpected = s(raw.jsonExpected) || null;
  if (has("port")) out.port = raw.port === "" || raw.port == null ? null : clamp(n(raw.port, 0), 1, 65535);
  if (has("udpPayload")) out.udpPayload = s(raw.udpPayload) || null;
  if (has("dnsRecordType")) out.dnsRecordType = DNS_TYPES.includes(s(raw.dnsRecordType).toUpperCase()) ? s(raw.dnsRecordType).toUpperCase() : "A";
  if (has("dnsExpected")) out.dnsExpected = s(raw.dnsExpected) || null;
  if (has("sslThresholds")) {
    const t = s(raw.sslThresholds) || "30,14,7,1";
    if (!/^\d+(\s*,\s*\d+)*$/.test(t)) return { error: "Expiry thresholds must be comma-separated days, e.g. 30,14,7,1" };
    out.sslThresholds = t.replace(/\s/g, "");
  }
  if (has("intervalSec")) {
    const i = n(raw.intervalSec, 60);
    if ((type ?? raw.type) === "heartbeat") out.intervalSec = clamp(i, 60, 30 * 86_400);
    else if (!ALLOWED_INTERVALS.includes(i)) return { error: `Interval must be one of ${ALLOWED_INTERVALS.join(", ")} seconds` };
    else out.intervalSec = i;
  }
  if (has("timeoutMs")) out.timeoutMs = clamp(n(raw.timeoutMs, 10_000), 1000, 60_000);
  if (has("regions")) {
    const r = s(raw.regions) || "local";
    if (!/^[\w*-]+(\s*,\s*[\w*-]+)*$/.test(r)) return { error: "Regions must be a comma-separated list of names" };
    out.regions = r.replace(/\s/g, "");
  }
  if (has("confirmations")) out.confirmations = clamp(n(raw.confirmations, 2), 1, 10);
  if (has("confirmRegions")) out.confirmRegions = clamp(n(raw.confirmRegions, 1), 1, 10);
  if (has("degradedThresholdMs")) out.degradedThresholdMs = raw.degradedThresholdMs === "" || raw.degradedThresholdMs == null ? null : clamp(n(raw.degradedThresholdMs, 0), 1, 120_000);
  if (has("heartbeatGraceSec")) out.heartbeatGraceSec = clamp(n(raw.heartbeatGraceSec, 300), 0, 7 * 86_400);
  if (has("escalationPolicyId")) out.escalationPolicyId = s(raw.escalationPolicyId) || null;
  if ("paused" in raw) out.paused = b(raw.paused, false);

  return { data: out as MonitorInput };
}

/** Public JSON shape for API responses and exports (no secrets). */
export function monitorToJson<T extends { authValue?: string | null; heartbeatToken?: string | null }>(m: T, includeSecrets = false) {
  const { authValue, ...rest } = m;
  return includeSecrets ? m : { ...rest, authValue: authValue ? "••••••" : null };
}
