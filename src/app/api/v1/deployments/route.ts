// Deployment markers, overlaid on response-time graphs. GitHub Actions example:
//   - run: |
//       curl -fsS -X POST "$STATUSREPORT_URL/api/v1/deployments" \
//         -H "Authorization: Bearer ${{ secrets.STATUSREPORT_KEY }}" -H "Content-Type: application/json" \
//         -d '{"version":"${{ github.sha }}","environment":"production","commitSha":"${{ github.sha }}"}'
import { authenticateApi, isResponse } from "@/lib/apiauth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await authenticateApi(req, "read");
  if (isResponse(ctx)) return ctx;
  return Response.json({ data: await db.deployment.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }) });
}

export async function POST(req: Request) {
  const ctx = await authenticateApi(req, "deployments");
  if (isResponse(ctx)) return ctx;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b?.version) return Response.json({ error: "version is required" }, { status: 422 });
  const monitorId = b.monitorId ? String(b.monitorId) : null;
  if (monitorId && !(await db.monitor.findFirst({ where: { id: monitorId, workspaceId: ctx.workspaceId } }))) {
    return Response.json({ error: "Unknown monitorId" }, { status: 422 });
  }
  const d = await db.deployment.create({
    data: {
      workspaceId: ctx.workspaceId,
      monitorId,
      version: String(b.version).slice(0, 120),
      environment: String(b.environment || "production").slice(0, 60),
      commitSha: b.commitSha ? String(b.commitSha).slice(0, 64) : null,
      url: b.url ? String(b.url).slice(0, 500) : null,
    },
  });
  return Response.json({ data: d }, { status: 201 });
}
