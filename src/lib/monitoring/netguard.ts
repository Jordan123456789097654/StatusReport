// SSRF protection: in SaaS mode, tenants must not be able to point monitors at the
// worker's internal network or cloud metadata endpoints. The guarded lookup runs inside
// the socket connect path, so DNS rebinding between "check" and "connect" can't slip through.
import dns from "node:dns";
import net from "node:net";
import { env } from "../env";

function v4ToInt(ip: string) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const V4_BLOCKS: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

export function isPrivateIp(ip: string): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) ip = mapped[1];
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return V4_BLOCKS.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || l.startsWith("ff");
  }
  return false;
}

export class BlockedTargetError extends Error {
  code = "EBLOCKED";
}

/** Throws for literal private IPs (Node skips `lookup` for IP literals). */
export function assertHostAllowed(host: string) {
  if (!env.blockPrivateTargets) return;
  const h = host.replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) {
    throw new BlockedTargetError(`Target ${host} is not allowed`);
  }
  if (net.isIP(h) && isPrivateIp(h)) throw new BlockedTargetError(`Private address ${h} is not allowed`);
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

/** Drop-in replacement for dns.lookup that refuses private addresses. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function guardedLookup(hostname: string, options: any, callback?: any): void {
  let opts = options;
  let cb: LookupCb = callback;
  if (typeof options === "function") {
    cb = options;
    opts = {};
  }
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return cb(err);
    const list = addresses as unknown as dns.LookupAddress[];
    if (!list.length) return cb(Object.assign(new Error(`No address for ${hostname}`), { code: "ENOTFOUND" }));
    if (env.blockPrivateTargets) {
      const bad = list.find((a) => isPrivateIp(a.address));
      if (bad) return cb(new BlockedTargetError(`Private address ${bad.address} is not allowed`));
    }
    if (opts?.all) cb(null, list);
    else cb(null, list[0].address, list[0].family);
  });
}

export async function resolveGuarded(host: string): Promise<string> {
  assertHostAllowed(host);
  if (net.isIP(host)) return host;
  return new Promise((resolve, reject) =>
    guardedLookup(host, {}, (err: Error | null, addr: string) => (err ? reject(err) : resolve(addr))),
  );
}

export function friendlyError(e: unknown): string {
  const err = e as NodeJS.ErrnoException & { reason?: string };
  switch (err?.code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `DNS lookup failed (${err.code})`;
    case "ECONNREFUSED":
      return "Connection refused";
    case "ECONNRESET":
      return "Connection reset by peer";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "Host unreachable";
    case "CERT_HAS_EXPIRED":
      return "TLS certificate has expired";
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
      return "TLS certificate is self-signed";
    case "ERR_TLS_CERT_ALTNAME_INVALID":
      return "TLS certificate does not match hostname";
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return "TLS certificate chain is incomplete";
    case "EBLOCKED":
      return err.message;
  }
  return err?.message || String(e);
}
