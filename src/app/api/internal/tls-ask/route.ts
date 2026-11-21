// Caddy on-demand TLS "ask" endpoint: Caddy only issues a certificate for hostnames
// that return 200 here, i.e. the app itself or a verified customer custom domain.
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const domain = (new URL(req.url).searchParams.get("domain") || "").toLowerCase().replace(/\.$/, "");
  if (!domain) return new Response("missing domain", { status: 400 });
  const appHosts = [env.appHost.split(":")[0], env.cnameTarget, ...env.extraAppHosts];
  if (appHosts.includes(domain)) return new Response("ok");
  const page = await db.statusPage.findFirst({ where: { customDomain: domain, domainStatus: "verified" }, select: { id: true } });
  return page ? new Response("ok") : new Response("unknown domain", { status: 404 });
}
