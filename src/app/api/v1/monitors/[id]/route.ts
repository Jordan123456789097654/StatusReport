import { authenticateApi, isResponse } from "@/lib/apiauth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { monitorToJson, parseMonitorInput } from "@/lib/monitorinput";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const ctx = await authenticateApi(req, "read");
  if (isResponse(ctx)) return ctx;
  const m = await db.monitor.findFirst({ where: { id: (await params).id, workspaceId: ctx.workspaceId } });
  if (!m) return Response.json({ error: "Not found" }, { status: 404 });
  const recent = await db.checkResult.findMany({ where: { monitorId: m.id }, orderBy: { createdAt: "desc" }, take: 20 });
  return Response.json({ data: { ...monitorToJson(m), recentChecks: recent } });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const ctx = await authenticateApi(req, "write");
  if (isResponse(ctx)) return ctx;
  const id = (await params).id;
  const existing = await db.monitor.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "JSON body required" }, { status: 400 });
  const parsed = parseMonitorInput({ type: existing.type, ...body }, true);
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 422 });
  const m = await db.monitor.update({ where: { id }, data: { ...parsed.data, ...("paused" in body ? { status: body.paused ? "paused" : "pending" } : {}) } });
  await audit({ workspaceId: ctx.workspaceId, actor: `api-key:${ctx.keyName}`, action: "monitor.update", target: id, meta: { fields: Object.keys(body) } });
  return Response.json({ data: monitorToJson(m) });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const ctx = await authenticateApi(req, "write");
  if (isResponse(ctx)) return ctx;
  const id = (await params).id;
  const res = await db.monitor.deleteMany({ where: { id, workspaceId: ctx.workspaceId } });
  if (!res.count) return Response.json({ error: "Not found" }, { status: 404 });
  await audit({ workspaceId: ctx.workspaceId, actor: `api-key:${ctx.keyName}`, action: "monitor.delete", target: id });
  return new Response(null, { status: 204 });
}
