// HTTP(S) checks with a per-phase latency breakdown (DNS → TCP → TLS → TTFB).
import http from "node:http";
import https from "node:https";
import type { TLSSocket } from "node:tls";
import { performance } from "node:perf_hooks";
import { assertHostAllowed, friendlyError, guardedLookup } from "./netguard";
import { checkJson, checkKeyword, statusMatches } from "./assertions";
import { down, type CheckOutcome, type MonitorRow, type Timings } from "./types";
import { json } from "../db";

type RawResponse =
  | {
      ok: true;
      statusCode: number;
      location?: string;
      body: string;
      timings: Timings;
      total: number;
      ip?: string;
      cert?: { validTo: string; issuer: string };
    }
  | { ok: false; error: string; timings: Timings; total: number };

const USER_AGENT = "StatusReport-Monitor/1.0 (+https://statusreport.roleflow.site)";

function buildRequest(m: MonitorRow): { headers: Record<string, string>; body?: string } {
  const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: "*/*", ...json<Record<string, string>>(m.headers, {}) };
  if (m.authType === "bearer" && m.authValue) headers.authorization = `Bearer ${m.authValue}`;
  if (m.authType === "basic" && m.authValue) headers.authorization = `Basic ${Buffer.from(m.authValue).toString("base64")}`;
  let body: string | undefined;
  if (m.body && !["GET", "HEAD"].includes(m.method)) {
    if (m.bodyType === "form") {
      const obj = json<Record<string, string> | null>(m.body, null);
      body = obj ? new URLSearchParams(obj).toString() : m.body;
      headers["content-type"] ??= "application/x-www-form-urlencoded";
    } else if (m.bodyType === "json") {
      body = m.body;
      headers["content-type"] ??= "application/json";
    } else {
      body = m.body;
    }
    headers["content-length"] = String(Buffer.byteLength(body));
  }
  return { headers, body };
}

function once(url: URL, m: MonitorRow): Promise<RawResponse> {
  return new Promise((resolve) => {
    const start = performance.now();
    let tLookup = 0;
    let tConnect = 0;
    let tSecure = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const isHttps = url.protocol === "https:";
    const timings = (): Timings => {
      const base = tLookup || start;
      const dnsMs = tLookup ? tLookup - start : 0;
      const tcpMs = tConnect ? tConnect - base : 0;
      const tlsMs = isHttps && tSecure && tConnect ? tSecure - tConnect : 0;
      return { dns: Math.round(dnsMs), tcp: Math.round(tcpMs), tls: Math.round(tlsMs), ttfb: 0 };
    };
    const finish = (r: RawResponse) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(r);
    };

    try {
      assertHostAllowed(url.hostname);
    } catch (e) {
      return finish({ ok: false, error: friendlyError(e), timings: timings(), total: 0 });
    }

    const { headers, body } = buildRequest(m);
    const lib = isHttps ? https : http;
    const req = lib.request(
      url,
      { method: m.method, headers, agent: false, lookup: guardedLookup, servername: url.hostname },
      (res) => {
        const tFirst = performance.now();
        const chunks: Buffer[] = [];
        let size = 0;
        const sock = res.socket as TLSSocket;
        let cert: { validTo: string; issuer: string } | undefined;
        if (isHttps && typeof sock.getPeerCertificate === "function") {
          const c = sock.getPeerCertificate();
          if (c && c.valid_to) cert = { validTo: c.valid_to, issuer: String(c.issuer?.O || c.issuer?.CN || "") };
        }
        const ip = sock.remoteAddress;
        res.on("data", (c: Buffer) => {
          if (size < 512_000) chunks.push(c);
          size += c.length;
        });
        res.on("end", () => {
          const t = timings();
          t.ttfb = Math.round(tFirst - (tSecure || tConnect || tLookup || start));
          finish({
            ok: true,
            statusCode: res.statusCode || 0,
            location: res.headers.location,
            body: Buffer.concat(chunks).toString("utf8"),
            timings: t,
            total: Math.round(performance.now() - start),
            ip,
            cert,
          });
        });
        res.on("error", (e) => finish({ ok: false, error: friendlyError(e), timings: timings(), total: Math.round(performance.now() - start) }));
      },
    );
    req.on("socket", (s) => {
      s.on("lookup", () => (tLookup = performance.now()));
      s.on("connect", () => (tConnect = performance.now()));
      s.on("secureConnect", () => (tSecure = performance.now()));
    });
    req.on("error", (e) => finish({ ok: false, error: friendlyError(e), timings: timings(), total: Math.round(performance.now() - start) }));
    timer = setTimeout(() => {
      const phase = !tConnect ? "Connection" : isHttps && !tSecure ? "TLS handshake" : "Response";
      req.destroy();
      finish({ ok: false, error: `${phase} timed out after ${m.timeoutMs}ms`, timings: timings(), total: m.timeoutMs });
    }, m.timeoutMs);
    if (body) req.write(body);
    req.end();
  });
}

export async function httpCheck(m: MonitorRow): Promise<CheckOutcome> {
  let url: URL;
  try {
    url = new URL(m.target);
    if (!["http:", "https:"].includes(url.protocol)) return down("URL must start with http:// or https://");
  } catch {
    return down("Invalid URL");
  }

  let res = await once(url, m);
  let totalLatency = res.total;
  for (let hop = 0; hop < 5 && m.followRedirects && res.ok && res.statusCode >= 300 && res.statusCode < 400 && res.location; hop++) {
    url = new URL(res.location, url);
    res = await once(url, m);
    totalLatency += res.total;
  }

  if (!res.ok) return down(res.error, { latencyMs: totalLatency, timings: res.timings });

  const base: Partial<CheckOutcome> = {
    statusCode: res.statusCode,
    latencyMs: totalLatency,
    timings: res.timings,
    snippet: res.body.slice(0, 500),
    ip: res.ip,
  };
  if (res.cert) {
    const expiresAt = new Date(res.cert.validTo);
    base.ssl = { expiresAt, issuer: res.cert.issuer, daysLeft: Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000) };
  }

  if (!statusMatches(res.statusCode, m.expectedStatus)) {
    return down(`Unexpected status code ${res.statusCode} (expected ${m.expectedStatus})`, base);
  }
  if ((m.type === "keyword" || m.keyword) && m.keyword) {
    const err = checkKeyword(res.body, m.keyword, m.keywordMode);
    if (err) return down(err, base);
  }
  if ((m.type === "json" || m.jsonPath) && m.jsonPath) {
    const err = checkJson(res.body, m.jsonPath, m.jsonOp, m.jsonExpected);
    if (err) return down(err, base);
  }
  return { ok: true, status: "up", ...base };
}
