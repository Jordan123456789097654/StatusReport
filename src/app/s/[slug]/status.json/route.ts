import { statusJson } from "@/lib/feeds";
import { loadPublic } from "@/lib/publicroute";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const r = await loadPublic(req, (await params).slug);
  if (r instanceof Response) return r;
  return Response.json(statusJson(r.page, r.data), {
    headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=30" },
  });
}
