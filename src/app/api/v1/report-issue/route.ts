import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const rl = await rateLimit(`report:${ip}`, 3, 10 * 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const body = (await req.json().catch(() => null)) as { pageId?: string; componentId?: string | null; message?: string; email?: string | null } | null;
  const message = String(body?.message || "").trim();
  if (!body?.pageId || message.length < 5) return Response.json({ error: "Please describe the problem" }, { status: 400 });
  const page = await db.statusPage.findUnique({ where: { id: body.pageId }, include: { components: { select: { id: true } } } });
  if (!page || !page.reportIssueEnabled) return Response.json({ error: "Issue reporting is disabled" }, { status: 404 });
  const componentId = body.componentId && page.components.some((c) => c.id === body.componentId) ? body.componentId : null;
  const email = body.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ? body.email.slice(0, 200) : null;
  await db.issueReport.create({ data: { statusPageId: page.id, componentId, message: message.slice(0, 2000), email, ipHash: sha256(`${ip}:${page.id}`).slice(0, 32) } });
  return Response.json({ ok: true });
}
