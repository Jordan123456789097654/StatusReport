import { authenticateApi, isResponse } from "@/lib/apiauth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { acknowledgeIncident, postIncidentUpdate } from "@/lib/incidents";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const ctx = await authenticateApi(req, "read");
  if (isResponse(ctx)) return ctx;
  const i = await db.incident.findFirst({
    where: { id: (await params).id, workspaceId: ctx.workspaceId },
    include: { updates: { orderBy: { createdAt: "desc" } }, monitors: true },
  });
  return i ? Response.json({ data: i }) : Response.json({ error: "Not found" }, { status: 404 });
}

/** Body: { status?, message?, severity?, acknowledge?: true, notify?: false } */
export async function PATCH(req: Request, { params }: Ctx) {
  const ctx = await authenticateApi(req, "write");
  if (isResponse(ctx)) return ctx;
  const id = (await params).id;
  const i = await db.incident.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!i) return Response.json({ error: "Not found" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.acknowledge) await acknowledgeIncident(id, `API key "${ctx.keyName}"`);
  if (b.message || b.status) {
    await postIncidentUpdate(id, { status: String(b.status || i.status), message: String(b.message || ""), severity: b.severity ? String(b.severity) : undefined, notify: b.notify !== false });
  } else if (b.severity) {
    await db.incident.update({ where: { id }, data: { severity: String(b.severity) } });
  }
  await audit({ workspaceId: ctx.workspaceId, actor: `api-key:${ctx.keyName}`, action: "incident.update", target: id, meta: b });
  return Response.json({ data: await db.incident.findUnique({ where: { id }, include: { updates: { orderBy: { createdAt: "desc" } } } }) });
}
