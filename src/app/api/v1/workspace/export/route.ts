import { authenticateApi, isResponse } from "@/lib/apiauth";
import { audit } from "@/lib/audit";
import { can, getSession } from "@/lib/auth";
import { exportWorkspace } from "@/lib/backup";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let workspaceId: string | null = null;
  let actor = "";
  if (req.headers.get("authorization")) {
    const ctx = await authenticateApi(req, "write");
    if (isResponse(ctx)) return ctx;
    workspaceId = ctx.workspaceId;
    actor = `api-key:${ctx.keyName}`;
  } else {
    const s = await getSession();
    if (!s || s.pending2fa) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const m = s.workspaceId
      ? await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: s.workspaceId, userId: s.userId } } })
      : await db.membership.findFirst({ where: { userId: s.userId } });
    if (!m || !can(m.role, "admin")) return Response.json({ error: "Admin role required" }, { status: 403 });
    workspaceId = m.workspaceId;
    actor = s.user.email;
  }
  const data = await exportWorkspace(workspaceId);
  await audit({ workspaceId, actor, action: "workspace.export" });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="statusreport-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
