import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";
import { isDiscordWebhookUrl } from "@/lib/notify/discord";
import { sendEmail } from "@/lib/notify/channels";
import { escapeHtml } from "@/lib/markdown";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = await rateLimit(`sub:${clientIp(req.headers)}`, 5, 10 * 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const body = (await req.json().catch(() => null)) as { pageId?: string; type?: string; target?: string; componentIds?: string[] } | null;
  if (!body?.pageId || !body.target) return Response.json({ error: "Missing fields" }, { status: 400 });
  const page = await db.statusPage.findUnique({ where: { id: body.pageId }, include: { components: { select: { id: true } } } });
  if (!page || !page.subscribersEnabled || page.visibility !== "public") return Response.json({ error: "Subscriptions are not available" }, { status: 404 });

  const type = body.type === "webhook" || body.type === "discord" ? body.type : "email";
  const target = body.target.trim().slice(0, 500);
  if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  if (type === "discord" && !isDiscordWebhookUrl(target)) return Response.json({ error: "Enter a Discord webhook URL" }, { status: 400 });
  if (type === "webhook" && !/^https:\/\//.test(target)) return Response.json({ error: "Webhook URL must use https://" }, { status: 400 });

  const valid = new Set(page.components.map((c) => c.id));
  const componentIds = (Array.isArray(body.componentIds) ? body.componentIds : []).filter((id) => valid.has(id));
  const token = randomToken(24);
  const existing = await db.subscriber.findUnique({ where: { statusPageId_type_target: { statusPageId: page.id, type, target } } });
  if (existing?.confirmed) return Response.json({ message: "You're already subscribed." });
  const sub = existing
    ? await db.subscriber.update({ where: { id: existing.id }, data: { componentIds: JSON.stringify(componentIds), token } })
    : await db.subscriber.create({ data: { statusPageId: page.id, type, target, componentIds: JSON.stringify(componentIds), token, confirmed: type !== "email" } });

  if (type === "email") {
    const link = `${env.appUrl}/api/v1/subscribe/confirm?token=${sub.token}`;
    await sendEmail(
      [target],
      `Confirm your subscription to ${page.name} status`,
      `<p>Confirm that you want incident updates for <strong>${escapeHtml(page.name)}</strong>:</p><p><a href="${link}">Confirm subscription</a></p>`,
      `Confirm your subscription to ${page.name}: ${link}`,
    );
    return Response.json({ message: "Check your inbox to confirm your subscription." });
  }
  return Response.json({ message: "Subscribed! You'll receive updates at that webhook." });
}
