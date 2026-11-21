import { authenticateApi, isResponse } from "@/lib/apiauth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { monitorToJson, parseMonitorInput } from "@/lib/monitorinput";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await authenticateApi(req, "read");
  if (isResponse(ctx)) return ctx;
  const monitors = await db.monitor.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "asc" } });
  return Response.json({ data: monitors.map((m) => monitorToJson(m)) });
}

export async function POST(req: Request) {
  const ctx = await authenticateApi(req, "write");
  if (isResponse(ctx)) return ctx;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "JSON body required" }, { status: 400 });
  const parsed = parseMonitorInput(body as Record<string, unknown>);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 422 });
  const monitor = await db.monitor.create({
    data: { ...parsed.data, workspaceId: ctx.workspaceId, heartbeatToken: parsed.data.type === "heartbeat" ? randomToken(18) : null },
  });
  await audit({ workspaceId: ctx.workspaceId, actor: `api-key:${ctx.keyName}`, action: "monitor.create", target: monitor.id, meta: { name: monitor.name } });
  return Response.json({ data: monitorToJson(monitor) }, { status: 201 });
}
