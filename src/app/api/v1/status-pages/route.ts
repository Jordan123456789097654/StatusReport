import { authenticateApi, isResponse } from "@/lib/apiauth";
import { db } from "@/lib/db";
import { statusPageBase } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ctx = await authenticateApi(req, "read");
  if (isResponse(ctx)) return ctx;
  const pages = await db.statusPage.findMany({ where: { workspaceId: ctx.workspaceId }, include: { components: true, sections: true } });
  return Response.json({
    data: pages.map(({ passwordHash: _pw, ...p }) => ({ ...p, url: statusPageBase(p), statusJson: `${statusPageBase(p)}/status.json` })),
  });
}
