// Server-side helpers for public status pages: lookup, access control and custom-JS gating.
import net from "node:net";
import { cookies, headers } from "next/headers";
import type { StatusPage } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { sign, verifySignature } from "./crypto";
import { clientIp } from "./ratelimit";
import { getSession } from "./auth";
import { findPage } from "./statuspage";

export const unlockCookieName = (pageId: string) => `sr_pp_${pageId}`;
export const unlockValue = (page: Pick<StatusPage, "id" | "passwordHash">) => sign(`pp:${page.id}:${page.passwordHash}`);

function ipInList(ip: string, list: string): boolean {
  const entries = list.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  const toInt = (a: string) => a.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
  return entries.some((e) => {
    if (!e.includes("/")) return e === ip;
    const [base, bitsStr] = e.split("/");
    const bits = Number(bitsStr);
    if (!net.isIPv4(base) || !net.isIPv4(ip) || !(bits >= 0 && bits <= 32)) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (toInt(ip) & mask) === (toInt(base) & mask);
  });
}

export type Access = "ok" | "password" | "denied";

export async function checkAccess(page: StatusPage): Promise<Access> {
  switch (page.visibility) {
    case "password": {
      const c = (await cookies()).get(unlockCookieName(page.id))?.value;
      return page.passwordHash && verifySignature(`pp:${page.id}:${page.passwordHash}`, c) ? "ok" : "password";
    }
    case "ip":
      return ipInList(clientIp(await headers()), page.ipAllowlist) ? "ok" : "denied";
    case "team": {
      const s = await getSession();
      if (!s || s.pending2fa) return "denied";
      const m = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: page.workspaceId, userId: s.userId } } });
      return m ? "ok" : "denied";
    }
    default:
      return "ok";
  }
}

/** Custom HTML/JS only runs on the customer's own (verified) origin, never on the app origin. */
export async function customHtmlAllowed(slugParam: string): Promise<boolean> {
  if (env.allowCustomJsOnAppHost) return true;
  const domain = (await headers()).get("x-sr-domain");
  return Boolean(domain) && decodeURIComponent(slugParam).toLowerCase() === `@${domain}`;
}

export async function getPublicPage(slugParam: string): Promise<{ page: StatusPage; access: Access } | null> {
  const page = await findPage(slugParam);
  if (!page) return null;
  return { page, access: await checkAccess(page) };
}
