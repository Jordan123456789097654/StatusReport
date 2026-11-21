// Shared loader for public route handlers (status.json, feeds, OG image).
import type { StatusPage } from "@prisma/client";
import { getPublicPage } from "./publicpage";
import { clientIp, rateLimit } from "./ratelimit";
import { loadViewData, readSnapshot, type ViewData } from "./statuspage";

export async function loadPublic(req: Request, slug: string): Promise<{ page: StatusPage; data: ViewData } | Response> {
  if (!(await rateLimit(`pub:${clientIp(req.headers)}`, 120, 60_000)).ok) return new Response("Too many requests", { status: 429 });
  try {
    const r = await getPublicPage(slug);
    if (!r) return new Response("Not found", { status: 404 });
    if (r.access !== "ok") return new Response("This status page is private", { status: 401 });
    return { page: r.page, data: await loadViewData(r.page) };
  } catch (e) {
    const snap = await readSnapshot(slug);
    if (snap) return snap;
    throw e;
  }
}
