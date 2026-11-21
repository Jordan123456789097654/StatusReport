import { authenticateApi, isResponse } from "@/lib/apiauth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { createManualIncident } from "@/lib/incidents";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await authenticateApi(req, "read");
  if (isResponse(ctx)) return ctx;
  const url = new URL(req.url);
  const open = url.searchParams.get("status") === "open";
  const incidents = await db.incident.findMany({
    where: { workspaceId: ctx.workspaceId, ...(open ? { resolvedAt: null } : {}) },
    include: { updates: { orderBy: { createdAt: "desc" } }, monitors: true },
    orderBy: { startedAt: "desc" },
    take: Math.min(Number(url.searchParams.get("limit")) || 50, 200),
  });
  return Response.json({ data: incidents });
}

export async function POST(req: Request) {
  const ctx = await authenticateApi(req, "write");
  if (isResponse(ctx)) return ctx;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b?.title) return Response.json({ error: "title is required" }, { status: 422 });
  const incident = await createManualIncident(ctx.workspaceId, {
    title: String(b.title),
    message: String(b.message || ""),
    status: b.status ? String(b.status) : undefined,
    severity: b.severity ? String(b.severity) : undefined,
    monitorIds: Array.isArray(b.monitorIds) ? b.monitorIds.map(String) : [],
    public: b.public !== false,
    notify: b.notify !== false,
  });
  await audit({ workspaceId: ctx.workspaceId, actor: `api-key:${ctx.keyName}`, action: "incident.create", target: incident.id });
  return Response.json({ data: incident }, { status: 201 });
}
