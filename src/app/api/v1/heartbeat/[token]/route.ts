// Heartbeat / cron check-in endpoint.
//   curl -fsS https://statusreport.roleflow.site/api/v1/heartbeat/<token>
//   curl -fsS "https://…/api/v1/heartbeat/<token>?status=fail&message=backup+failed"
import { db } from "@/lib/db";
import { recordHeartbeat } from "@/lib/monitoring/engine";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

async function handle(req: Request, token: string) {
  if (!/^[\w-]{10,64}$/.test(token)) return Response.json({ error: "Invalid token" }, { status: 404 });
  if (!(await rateLimit(`hb:${token}`, 30, 60_000)).ok) return Response.json({ error: "Too many check-ins" }, { status: 429 });
  const monitor = await db.monitor.findUnique({ where: { heartbeatToken: token } });
  if (!monitor || monitor.type !== "heartbeat") return Response.json({ error: "Unknown heartbeat" }, { status: 404 });
  if (monitor.paused) return Response.json({ ok: true, paused: true });
  const url = new URL(req.url);
  const failed = ["fail", "failure", "error", "down"].includes((url.searchParams.get("status") || "").toLowerCase());
  await recordHeartbeat(monitor, !failed, url.searchParams.get("message")?.slice(0, 500));
  return Response.json({ ok: true, monitor: monitor.name, received_at: new Date().toISOString() });
}

type Ctx = { params: Promise<{ token: string }> };
export async function GET(req: Request, { params }: Ctx) {
  return handle(req, (await params).token);
}
export async function POST(req: Request, { params }: Ctx) {
  return handle(req, (await params).token);
}
export async function HEAD(req: Request, { params }: Ctx) {
  const r = await handle(req, (await params).token);
  return new Response(null, { status: r.status });
}
