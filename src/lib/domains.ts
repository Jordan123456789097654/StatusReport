// Custom-domain validation and CNAME verification.
import dns from "node:dns/promises";
import { db } from "./db";
import { env } from "./env";

export function normalizeDomain(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
}

export function validateDomain(domain: string): string | null {
  if (!domain) return null;
  if (domain.length > 253 || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    return "Enter a valid hostname, e.g. status.example.com";
  }
  const reserved = [env.appHost.split(":")[0], env.cnameTarget, ...env.extraAppHosts.map((h) => h.split(":")[0])];
  if (reserved.some((r) => domain === r || domain.endsWith(`.${r}`))) return "That hostname is reserved";
  return null;
}

const strip = (s: string) => s.toLowerCase().replace(/\.$/, "");

/** True when the domain's CNAME (or flattened A records) points at our CNAME target. */
export async function checkDomainDns(domain: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const cnames = await dns.resolveCname(domain).catch(() => [] as string[]);
    if (cnames.map(strip).includes(env.cnameTarget)) return { ok: true, detail: `CNAME → ${env.cnameTarget}` };
    if (cnames.length) return { ok: false, detail: `CNAME points to ${cnames.map(strip).join(", ")} instead of ${env.cnameTarget}` };
    // Apex domains / CNAME flattening (e.g. Cloudflare): compare A records.
    const none = (): string[] => [];
    const [mine, target] = await Promise.all([dns.resolve4(domain).catch(none), dns.resolve4(env.cnameTarget).catch(none)]);
    if (mine.length && target.length && mine.every((ip) => target.includes(ip))) return { ok: true, detail: "A records match (CNAME flattening)" };
    return { ok: false, detail: mine.length ? `Found A records ${mine.join(", ")} but no CNAME to ${env.cnameTarget}` : "No CNAME record found yet" };
  } catch (e) {
    return { ok: false, detail: (e as Error).message };
  }
}

export async function verifyPageDomain(pageId: string): Promise<{ ok: boolean; detail: string }> {
  const page = await db.statusPage.findUnique({ where: { id: pageId } });
  if (!page?.customDomain) return { ok: false, detail: "No custom domain configured" };
  const r = await checkDomainDns(page.customDomain);
  await db.statusPage.update({
    where: { id: pageId },
    data: {
      domainCheckedAt: new Date(),
      domainStatus: r.ok ? "verified" : page.domainStatus === "verified" ? "failed" : "pending",
      domainVerifiedAt: r.ok ? (page.domainVerifiedAt ?? new Date()) : page.domainVerifiedAt,
      domainError: r.ok ? null : r.detail,
    },
  });
  return r;
}
