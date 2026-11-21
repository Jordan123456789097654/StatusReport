import { notFound } from "next/navigation";
import { getPublicPage } from "@/lib/publicpage";
import { loadIncident, pageConfig } from "@/lib/statuspage";
import { googleFontHref, tokensToStyle } from "@/lib/themes";
import { statusPageBase } from "@/lib/urls";
import { Gate } from "../../gate";

export const dynamic = "force-dynamic";

const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

export default async function IncidentPage({ params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const r = await getPublicPage(slug);
  if (!r) notFound();
  if (r.access !== "ok") return <Gate page={r.page} mode={r.access} back={slug.startsWith("@") ? "/" : `/s/${slug}`} />;
  const incident = await loadIncident(r.page, Number(number));
  if (!incident) notFound();
  const config = pageConfig(r.page);
  const s = config.strings as Record<string, string>;
  const base = statusPageBase(r.page);
  const tone = incident.resolvedAt ? "var(--sr-up)" : "var(--sr-down)";

  return (
    <div className="min-h-screen" style={{ ...tokensToStyle(config.tokens), background: "var(--sr-bg)", color: "var(--sr-text)", fontFamily: "var(--sr-font)" }}>
      <link rel="stylesheet" href={googleFontHref(config.tokens.font)} precedence="default" />
      <main className="mx-auto max-w-2xl px-4 py-10">
        <a href={base} className="text-sm" style={{ color: "var(--sr-muted)" }}>
          ← {config.name}
        </a>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{incident.title}</h1>
          <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium" style={{ color: tone, borderColor: tone }}>
            {s[incident.status] || incident.status}
          </span>
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--sr-muted)" }}>
          Incident #{incident.label} · {fmt(incident.startedAt)}
          {incident.resolvedAt ? ` → ${fmt(incident.resolvedAt)}` : ""}
          {incident.affected.length ? ` · Affected: ${incident.affected.join(", ")}` : ""}
        </p>

        <ol className="mt-8 space-y-0 border-l" style={{ borderColor: "var(--sr-border)" }}>
          {incident.updates.map((u, i) => (
            <li key={i} className="relative pb-7 pl-6">
              <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full" style={{ background: u.status === "resolved" ? "var(--sr-up)" : i === 0 ? tone : "var(--sr-muted)" }} />
              <div className="text-sm font-semibold capitalize">{s[u.status] || u.status}</div>
              <div className="prose-sr mt-1 text-sm" dangerouslySetInnerHTML={{ __html: u.html }} />
              <div className="mt-1 text-xs" style={{ color: "var(--sr-muted)" }}>{fmt(u.createdAt)}</div>
            </li>
          ))}
        </ol>

        {incident.postmortemHtml && (
          <section className="mt-6 border p-6" style={{ background: "var(--sr-surface)", borderColor: "var(--sr-border)", borderRadius: "var(--sr-radius)" }}>
            <h2 className="mb-2 text-lg font-semibold">{s.postmortem || "Post-mortem"}</h2>
            <div className="prose-sr text-sm" dangerouslySetInnerHTML={{ __html: incident.postmortemHtml }} />
          </section>
        )}
      </main>
    </div>
  );
}
