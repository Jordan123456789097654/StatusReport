// Dynamic OpenGraph card showing live system health (Discord / X / Slack previews).
import { ImageResponse } from "next/og";
import { loadPublic } from "@/lib/publicroute";
import type { ComponentStatus } from "@/lib/statuspage";

export const dynamic = "force-dynamic";

const COLORS: Record<ComponentStatus, string> = { operational: "#22C55E", degraded: "#F59E0B", partial: "#F97316", major: "#EF4444", maintenance: "#3B82F6" };
const TEXT: Record<ComponentStatus, string> = {
  operational: "All systems operational",
  degraded: "Degraded performance",
  partial: "Partial outage",
  major: "Major outage",
  maintenance: "Under maintenance",
};

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const r = await loadPublic(req, (await params).slug);
  if (r instanceof Response) return r;
  const { page, data } = r;
  const comps = data.sections.flatMap((s) => s.components).slice(0, 6);
  const color = COLORS[data.overall];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0B0D12", color: "#E6E8EE", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 34, color: "#8B90A0" }}>{page.name} status</div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 28 }}>
          <div style={{ width: 34, height: 34, borderRadius: 34, background: color, boxShadow: `0 0 40px 8px ${color}66` }} />
          <div style={{ display: "flex", fontSize: 62, fontWeight: 700, marginLeft: 26 }}>{TEXT[data.overall]}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 48, gap: 14 }}>
          {comps.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", fontSize: 26 }}>
              <div style={{ width: 14, height: 14, borderRadius: 14, background: COLORS[c.status], marginRight: 16 }} />
              <div style={{ display: "flex", flex: 1 }}>{c.name}</div>
              <div style={{ display: "flex", color: "#8B90A0" }}>{c.uptime == null ? "-" : `${c.uptime.toFixed(2)}%`}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 22, color: "#5E6372" }}>statusreport.roleflow.site</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=120" } },
  );
}
