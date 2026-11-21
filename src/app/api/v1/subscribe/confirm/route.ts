import { db } from "@/lib/db";
import { statusPageBase } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const sub = token ? await db.subscriber.findUnique({ where: { token }, include: { statusPage: true } }) : null;
  if (!sub) return new Response("This confirmation link is invalid or has expired.", { status: 404 });
  await db.subscriber.update({ where: { id: sub.id }, data: { confirmed: true } });
  return Response.redirect(`${statusPageBase(sub.statusPage)}?ok=subscribed`, 302);
}
