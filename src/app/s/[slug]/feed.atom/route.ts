import { atom } from "@/lib/feeds";
import { loadPublic } from "@/lib/publicroute";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const r = await loadPublic(req, (await params).slug);
  if (r instanceof Response) return r;
  return new Response(atom(r.page, r.data), { headers: { "content-type": "application/atom+xml; charset=utf-8", "cache-control": "public, max-age=60" } });
}
