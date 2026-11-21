// TCP, UDP, ICMP ping, DNS, SSL certificate and domain-expiry checks.
import net from "node:net";
import tls from "node:tls";
import dgram from "node:dgram";
import dns from "node:dns/promises";
import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import { assertHostAllowed, friendlyError, guardedLookup, resolveGuarded } from "./netguard";
import { down, parseHostPort, up, type CheckOutcome, type MonitorRow } from "./types";

export function tcpCheck(m: MonitorRow): Promise<CheckOutcome> {
  const { host, port } = parseHostPort(m.target, m.port);
  if (!host || !port) return Promise.resolve(down("Target must be host:port"));
  try {
    assertHostAllowed(host);
  } catch (e) {
    return Promise.resolve(down(friendlyError(e)));
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const sock = net.connect({ host, port, lookup: guardedLookup });
    const done = (o: CheckOutcome) => {
      sock.destroy();
      clearTimeout(timer);
      resolve(o);
    };
    const timer = setTimeout(() => done(down(`TCP connect to ${host}:${port} timed out after ${m.timeoutMs}ms`)), m.timeoutMs);
    sock.once("connect", () => {
      const ms = Math.round(performance.now() - start);
      done(up({ latencyMs: ms, timings: { dns: 0, tcp: ms, tls: 0, ttfb: 0 }, ip: sock.remoteAddress }));
    });
    sock.once("error", (e) => done(down(friendlyError(e), { latencyMs: Math.round(performance.now() - start) })));
  });
}

export async function udpCheck(m: MonitorRow): Promise<CheckOutcome> {
  const { host, port } = parseHostPort(m.target, m.port);
  if (!host || !port) return down("Target must be host:port");
  let ip: string;
  try {
    ip = await resolveGuarded(host);
  } catch (e) {
    return down(friendlyError(e));
  }
  return new Promise((resolve) => {
    const sock = dgram.createSocket(net.isIPv6(ip) ? "udp6" : "udp4");
    const start = performance.now();
    const expectReply = Boolean(m.keyword);
    const done = (o: CheckOutcome) => {
      clearTimeout(timer);
      try {
        sock.close();
      } catch {}
      resolve(o);
    };
    const timer = setTimeout(() => {
      // No ICMP "port unreachable" came back: the port is open|filtered.
      if (expectReply) done(down(`No UDP reply within ${m.timeoutMs}ms`));
      else done(up({ latencyMs: Math.round(performance.now() - start), ip }));
    }, m.timeoutMs);
    sock.on("message", (msg) => {
      const ms = Math.round(performance.now() - start);
      if (m.keyword && !msg.toString("utf8").includes(m.keyword)) done(down(`UDP reply did not contain "${m.keyword}"`, { latencyMs: ms }));
      else done(up({ latencyMs: ms, ip, snippet: msg.toString("utf8").slice(0, 200) }));
    });
    sock.on("error", (e) => done(down(friendlyError(e))));
    sock.connect(port, ip, () => sock.send(Buffer.from(m.udpPayload || "\n")));
  });
}

export async function pingCheck(m: MonitorRow): Promise<CheckOutcome> {
  const host = parseHostPort(m.target).host;
  if (!/^[a-zA-Z0-9.:-]+$/.test(host)) return down("Invalid host");
  let ip: string;
  try {
    ip = await resolveGuarded(host);
  } catch (e) {
    return down(friendlyError(e));
  }
  const win = process.platform === "win32";
  const timeoutSec = Math.max(1, Math.ceil(m.timeoutMs / 1000));
  const args = win ? ["-n", "1", "-w", String(m.timeoutMs), ip] : ["-c", "1", "-W", String(timeoutSec), ip];
  return new Promise((resolve) => {
    const start = performance.now();
    execFile("ping", args, { timeout: m.timeoutMs + 2000 }, async (err, stdout) => {
      // No ping binary (serverless platforms such as Vercel): fall back to a TCP reachability probe.
      if ((err as NodeJS.ErrnoException | null)?.code === "ENOENT") {
        for (const port of [443, 80]) {
          const ms = await tcpProbe(ip, port, Math.min(m.timeoutMs, 5000));
          if (ms != null) return resolve(up({ latencyMs: ms, ip, snippet: `ICMP unavailable on this runtime; TCP ${port} reachable` }));
        }
        return resolve(down(`Host ${host} unreachable (ICMP unavailable; TCP 443/80 probe failed)`, { ip }));
      }
      const match = String(stdout).match(/time[=<]\s*([\d.]+)\s*ms/i);
      if (err || !match) return resolve(down(`Host ${host} did not respond to ICMP ping`, { ip }));
      const ms = Math.round(Number(match[1]) || performance.now() - start);
      resolve(up({ latencyMs: ms, ip }));
    });
  });
}

/** Resolves with the connect time in ms, or null when the port is unreachable. */
function tcpProbe(ip: string, port: number, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const sock = net.connect({ host: ip, port });
    const finish = (v: number | null) => {
      clearTimeout(timer);
      sock.destroy();
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    sock.once("connect", () => finish(Math.round(performance.now() - start)));
    sock.once("error", () => finish(null));
  });
}

const normalize = (v: string) => v.trim().toLowerCase().replace(/\.$/, "");

export async function dnsCheck(m: MonitorRow): Promise<CheckOutcome> {
  const host = m.target.replace(/^[a-z]+:\/\//i, "").replace(/[/:].*$/, "");
  const start = performance.now();
  let values: string[];
  try {
    switch (m.dnsRecordType) {
      case "AAAA":
        values = await dns.resolve6(host);
        break;
      case "CNAME":
        values = await dns.resolveCname(host);
        break;
      case "MX":
        values = (await dns.resolveMx(host)).map((r) => `${r.priority} ${r.exchange}`);
        break;
      case "TXT":
        values = (await dns.resolveTxt(host)).map((r) => r.join(""));
        break;
      case "NS":
        values = await dns.resolveNs(host);
        break;
      default:
        values = await dns.resolve4(host);
    }
  } catch (e) {
    return down(`DNS ${m.dnsRecordType} lookup failed: ${friendlyError(e)}`);
  }
  const ms = Math.round(performance.now() - start);
  const got = values.map(normalize).sort();
  const snippet = got.join(", ");
  if (m.dnsExpected?.trim()) {
    const want = m.dnsExpected.split(",").map(normalize).filter(Boolean).sort();
    if (JSON.stringify(want) !== JSON.stringify(got)) {
      return down(`DNS drift on ${m.dnsRecordType} ${host}: expected [${want.join(", ")}], got [${snippet}]`, { latencyMs: ms, snippet });
    }
  }
  return up({ latencyMs: ms, timings: { dns: ms, tcp: 0, tls: 0, ttfb: 0 }, snippet });
}

export function sslCheck(m: MonitorRow): Promise<CheckOutcome> {
  const { host, port } = parseHostPort(m.target.replace(/^https?:\/\//, ""), m.port || 443);
  try {
    assertHostAllowed(host);
  } catch (e) {
    return Promise.resolve(down(friendlyError(e)));
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const sock = tls.connect({ host, port: port || 443, servername: host, rejectUnauthorized: false, lookup: guardedLookup });
    const done = (o: CheckOutcome) => {
      clearTimeout(timer);
      sock.destroy();
      resolve(o);
    };
    const timer = setTimeout(() => done(down(`TLS handshake timed out after ${m.timeoutMs}ms`)), m.timeoutMs);
    sock.once("secureConnect", () => {
      const ms = Math.round(performance.now() - start);
      const cert = sock.getPeerCertificate();
      if (!cert || !cert.valid_to) return done(down("No certificate presented"));
      const expiresAt = new Date(cert.valid_to);
      const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);
      const ssl = { expiresAt, issuer: String(cert.issuer?.O || cert.issuer?.CN || "unknown"), daysLeft };
      const extra = { latencyMs: ms, ssl, expiryDaysLeft: daysLeft, ip: sock.remoteAddress };
      if (daysLeft < 0) return done(down(`TLS certificate expired ${-daysLeft} day(s) ago`, extra));
      if (!sock.authorized) return done(down(`TLS certificate is not trusted: ${sock.authorizationError}`, extra));
      done(up(extra));
    });
    sock.once("error", (e) => done(down(friendlyError(e))));
  });
}

export async function domainCheck(m: MonitorRow): Promise<CheckOutcome> {
  const domain = m.target.replace(/^[a-z]+:\/\//i, "").replace(/[/:].*$/, "").replace(/^www\./, "").toLowerCase();
  const start = performance.now();
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: "application/rdap+json" },
      signal: AbortSignal.timeout(Math.max(m.timeoutMs, 15000)),
    });
    if (res.status === 404) return down(`Domain ${domain} is not registered (RDAP 404)`);
    if (!res.ok) return down(`RDAP lookup failed with HTTP ${res.status}`);
    const data = (await res.json()) as { events?: { eventAction: string; eventDate: string }[] };
    const exp = data.events?.find((e) => e.eventAction === "expiration")?.eventDate;
    const ms = Math.round(performance.now() - start);
    if (!exp) return up({ latencyMs: ms, snippet: "Registry does not publish an expiration date" });
    const expiresAt = new Date(exp);
    const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000);
    const extra = { latencyMs: ms, domainExpiresAt: expiresAt, expiryDaysLeft: daysLeft };
    if (daysLeft < 0) return down(`Domain ${domain} expired ${-daysLeft} day(s) ago`, extra);
    return up(extra);
  } catch (e) {
    return down(`RDAP lookup failed: ${friendlyError(e)}`);
  }
}
