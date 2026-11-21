"use client";

// Renders a public status page from a ViewData + PageConfig. Used by /s/[slug], custom domains,
// the static snapshot fallback, the dashboard customizer preview, and the landing-page sandbox.
import { ChevronDown, ChevronRight, Rss, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Block } from "@/lib/blocks";
import { LOCALES } from "@/lib/i18n";
import type { ComponentStatus, ComponentView, IncidentView, PageConfig, ViewData } from "@/lib/statuspage";
import { tokensToStyle } from "@/lib/themes";
import { LatencyChart, UptimeBars } from "./charts";

const COLOR: Record<ComponentStatus, string> = {
  operational: "var(--sr-up)",
  degraded: "var(--sr-degraded)",
  partial: "#F97316",
  major: "var(--sr-down)",
  maintenance: "var(--sr-maintenance)",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

function Surface({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`border ${className}`}
      style={{
        background: "var(--sr-surface)",
        borderColor: "var(--sr-border)",
        borderRadius: "var(--sr-radius)",
        boxShadow: "var(--sr-shadow)",
        backdropFilter: "blur(var(--sr-blur))",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Dot({ status, size = 10 }: { status: ComponentStatus; size?: number }) {
  return <span className="sr-pulse inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: COLOR[status], color: COLOR[status] }} />;
}

/** Re-creates <script> tags so injected custom HTML can run (custom domains only). */
export function CustomHtml({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html;
    el.querySelectorAll("script").forEach((old) => {
      const s = document.createElement("script");
      for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value);
      s.text = old.text;
      old.replaceWith(s);
    });
  }, [html]);
  return <div ref={ref} />;
}

export function StatusPageView({
  data,
  config,
  allowCustomHtml,
  preview = false,
}: {
  data: ViewData;
  config: PageConfig;
  allowCustomHtml: boolean;
  preview?: boolean;
}) {
  const s = config.strings;
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [lang, setLang] = useState(config.locale);

  const overallText: Record<ComponentStatus, string> = {
    operational: s.allOperational,
    degraded: s.someDegraded,
    partial: s.partialOutage,
    major: s.majorOutage,
    maintenance: s.underMaintenance,
  };
  const componentText: Record<ComponentStatus, string> = {
    operational: s.operational,
    degraded: s.degraded,
    partial: s.partial,
    major: s.major,
    maintenance: s.maintenance,
  };
  const statusWord = (st: string) => (s as Record<string, string>)[st] || st;

  const renderBlock = (b: Block): ReactNode => {
    switch (b.type) {
      case "hero":
        return (
          <header className="flex flex-col items-center gap-3 pb-2 pt-4 text-center">
            {config.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logoUrl} alt={config.name} className="h-10 max-w-[220px] object-contain" />
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">{config.name}</h1>
            )}
            {config.description && <p className="max-w-xl text-sm" style={{ color: "var(--sr-muted)" }}>{config.description}</p>}
            <div className="flex gap-2">
              {config.websiteUrl && (
                <a href={config.websiteUrl} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: "var(--sr-border)", color: "var(--sr-muted)" }}>
                  Visit website ↗
                </a>
              )}
              {config.subscribersEnabled && (
                <button
                  onClick={() => setSubscribeOpen(true)}
                  className="cursor-pointer rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: "var(--sr-accent)", color: "var(--sr-bg)" }}
                >
                  {s.subscribe}
                </button>
              )}
            </div>
          </header>
        );
      case "status-banner":
        return (
          <Surface className="flex items-center gap-4 px-6 py-5">
            <span className="relative flex h-4 w-4 items-center justify-center">
              <span className="absolute h-4 w-4 rounded-full opacity-25" style={{ background: COLOR[data.overall], boxShadow: `0 0 24px 6px ${COLOR[data.overall]}` }} />
              <Dot status={data.overall} size={12} />
            </span>
            <div className="text-lg font-semibold">{overallText[data.overall]}</div>
            {data.snapshot && <span className="ml-auto text-xs" style={{ color: "var(--sr-muted)" }}>Cached snapshot</span>}
          </Surface>
        );
      case "maintenance":
        if (!data.maintenances.length) return null;
        return (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--sr-muted)" }}>{s.scheduledMaintenance}</h2>
            <div className="space-y-3">
              {data.maintenances.map((m) => (
                <Surface key={m.id} className="px-5 py-4" style={{ borderLeft: "3px solid var(--sr-maintenance)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{m.title}</div>
                    <span className="text-xs" style={{ color: "var(--sr-maintenance)" }}>{m.status === "in_progress" ? "In progress" : "Scheduled"}</span>
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--sr-muted)" }}>
                    {fmt(m.startsAt)} → {fmt(m.endsAt)}
                  </div>
                  {m.description && <p className="mt-2 text-sm">{m.description}</p>}
                </Surface>
              ))}
            </div>
          </section>
        );
      case "active-incidents":
        if (!data.activeIncidents.length) return null;
        return (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--sr-muted)" }}>{s.activeIncidents}</h2>
            <div className="space-y-3">
              {data.activeIncidents.map((i) => (
                <IncidentCard key={i.id} incident={i} base={data.baseUrl} statusWord={statusWord} active />
              ))}
            </div>
          </section>
        );
      case "components":
        return (
          <section className="space-y-4">
            {data.sections.map((sec) => (
              <SectionBlock key={sec.id} section={sec} config={config} componentText={componentText} />
            ))}
            {!data.sections.length && (
              <Surface className="px-5 py-8 text-center text-sm" style={{ color: "var(--sr-muted)" }}>
                No components yet.
              </Surface>
            )}
          </section>
        );
      case "incident-history":
        return (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--sr-muted)" }}>{s.incidentHistory}</h2>
            {data.history.length ? (
              <div className="space-y-3">
                {data.history.map((i) => (
                  <IncidentCard key={i.id} incident={i} base={data.baseUrl} statusWord={statusWord} />
                ))}
              </div>
            ) : (
              <Surface className="px-5 py-6 text-sm" style={{ color: "var(--sr-muted)" }}>
                {s.noIncidents}
              </Surface>
            )}
          </section>
        );
      case "subscribe":
        if (!config.subscribersEnabled) return null;
        return (
          <Surface className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div>
              <div className="font-semibold">{s.subscribe}</div>
              <div className="text-sm" style={{ color: "var(--sr-muted)" }}>{s.subscribeCta}</div>
            </div>
            <div className="flex gap-2">
              <a href={`${data.baseUrl}/feed.rss`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--sr-border)" }}>
                <Rss size={14} /> RSS
              </a>
              <button onClick={() => setSubscribeOpen(true)} className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: "var(--sr-accent)", color: "var(--sr-bg)" }}>
                Subscribe
              </button>
            </div>
          </Surface>
        );
      case "custom-html":
        if (!b.html) return null;
        if (allowCustomHtml) return <CustomHtml html={b.html} />;
        return preview ? (
          <div className="rounded-lg border border-dashed px-4 py-3 text-xs" style={{ borderColor: "var(--sr-border)", color: "var(--sr-muted)" }}>
            Custom HTML block: renders on your verified custom domain.
          </div>
        ) : null;
    }
  };

  return (
    <div className="sr-page min-h-full" style={{ ...(tokensToStyle(config.tokens) as CSSProperties), background: "var(--sr-bg)", color: "var(--sr-text)", fontFamily: "var(--sr-font)" }}>
      {allowCustomHtml && config.customHeader && <CustomHtml html={config.customHeader} />}
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-10">
        {config.blocks.filter((b) => b.enabled).map((b) => (
          <div key={b.id}>{renderBlock(b)}</div>
        ))}
        <footer className="flex flex-wrap items-center justify-between gap-3 pt-4 text-xs" style={{ color: "var(--sr-muted)" }}>
          <span>
            {s.lastUpdated} {fmt(data.generatedAt)} · {s.poweredBy}{" "}
            <a href="https://statusreport.roleflow.site" className="underline underline-offset-2">
              StatusReport
            </a>
          </span>
          <span className="flex items-center gap-3">
            {config.reportIssueEnabled && (
              <button onClick={() => setReportOpen(true)} className="cursor-pointer underline underline-offset-2">
                {s.reportIssue}
              </button>
            )}
            {!preview && (
              <select
                aria-label="Language"
                value={lang}
                onChange={(e) => {
                  setLang(e.target.value);
                  const u = new URL(window.location.href);
                  u.searchParams.set("lang", e.target.value);
                  window.location.href = u.toString();
                }}
                className="cursor-pointer rounded border bg-transparent px-1.5 py-0.5"
                style={{ borderColor: "var(--sr-border)" }}
              >
                {Object.entries(LOCALES).map(([k, v]) => (
                  <option key={k} value={k} style={{ color: "#000" }}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </span>
        </footer>
      </main>
      {allowCustomHtml && config.customFooter && <CustomHtml html={config.customFooter} />}
      {subscribeOpen && <SubscribeModal pageId={data.pageId} sections={data.sections} base={data.baseUrl} onClose={() => setSubscribeOpen(false)} preview={preview} />}
      {reportOpen && <ReportModal pageId={data.pageId} components={data.sections.flatMap((x) => x.components)} onClose={() => setReportOpen(false)} preview={preview} title={s.reportIssue} />}
    </div>
  );
}

function SectionBlock({ section, config, componentText }: { section: ViewData["sections"][number]; config: PageConfig; componentText: Record<ComponentStatus, string> }) {
  const [open, setOpen] = useState(!section.collapsed);
  return (
    <Surface className="overflow-hidden">
      {section.name && (
        <button onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <span className="flex-1 font-semibold">{section.name}</span>
          <span className="flex items-center gap-2 text-xs" style={{ color: COLOR[section.status] }}>
            <Dot status={section.status} size={8} /> {componentText[section.status]}
          </span>
        </button>
      )}
      {open && (
        <div className="divide-y" style={{ borderColor: "var(--sr-border)" }}>
          {section.components.map((c) => (
            <ComponentRow key={c.id} c={c} config={config} label={componentText[c.status]} first={!section.name} />
          ))}
        </div>
      )}
    </Surface>
  );
}

function ComponentRow({ c, config, label, first }: { c: ComponentView; config: PageConfig; label: string; first: boolean }) {
  const [chart, setChart] = useState(false);
  const s = config.strings;
  return (
    <div className="px-5 py-4" style={{ borderTop: first ? undefined : "1px solid var(--sr-border)" }}>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{c.name}</span>
        {c.description && <span className="text-xs" style={{ color: "var(--sr-muted)" }} title={c.description}>ⓘ</span>}
        <span className="ml-auto flex items-center gap-3 text-sm">
          {c.uptime != null && (
            <span className="tabular-nums" style={{ color: "var(--sr-muted)" }}>
              {(Math.floor(c.uptime * 1000) / 1000).toFixed(3)}% {s.uptime}
            </span>
          )}
          <span className="flex items-center gap-1.5" style={{ color: COLOR[c.status] }}>
            <Dot status={c.status} size={8} /> {label}
          </span>
        </span>
      </div>
      <UptimeBars bars={c.bars} config={config.bars} labels={{ uptime: s.uptime, noData: s.noData, today: s.today, daysAgo: s.daysAgo }} />
      {c.showLatency && (
        <div className="mt-3">
          <button onClick={() => setChart(!chart)} className="cursor-pointer text-xs underline-offset-2 hover:underline" style={{ color: "var(--sr-muted)" }}>
            {chart ? "▾" : "▸"} {s.responseTime}
            {c.latency.length ? ` · ${c.latency[c.latency.length - 1].v}ms` : ""}
          </button>
          {chart && (
            <div className="mt-2">
              <LatencyChart points={c.latency} deployments={c.deployments} height={110} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IncidentCard({ incident: i, base, statusWord, active }: { incident: IncidentView; base: string; statusWord: (s: string) => string; active?: boolean }) {
  const latest = i.updates[0];
  const tone = i.resolvedAt ? "var(--sr-up)" : i.severity === "degraded" ? "var(--sr-degraded)" : i.severity === "maintenance" ? "var(--sr-maintenance)" : "var(--sr-down)";
  return (
    <Surface className="px-5 py-4" style={active ? { borderLeft: `3px solid ${tone}` } : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href={`${base}/incidents/${i.number}`} className="font-medium hover:underline">
          {i.title}
        </a>
        <span className="text-xs font-medium" style={{ color: tone }}>
          {statusWord(i.status)}
        </span>
      </div>
      {latest && (
        <div className="mt-2 text-sm">
          <div className="prose-sr" dangerouslySetInnerHTML={{ __html: latest.html }} />
        </div>
      )}
      <div className="mt-2 text-xs" style={{ color: "var(--sr-muted)" }}>
        {fmt(i.startedAt)}
        {i.resolvedAt ? ` → ${fmt(i.resolvedAt)}` : ""}
        {i.affected.length ? ` · ${i.affected.join(", ")}` : ""}
      </div>
    </Surface>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
        <Surface className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">{title}</h3>
            <button onClick={onClose} className="cursor-pointer" aria-label="Close">
              <X size={18} />
            </button>
          </div>
          {children}
        </Surface>
      </div>
    </div>
  );
}

const fieldStyle: CSSProperties = { background: "var(--sr-bg)", borderColor: "var(--sr-border)", color: "var(--sr-text)", borderRadius: 8 };

function SubscribeModal({ pageId, sections, base, onClose, preview }: { pageId: string; sections: ViewData["sections"]; base: string; onClose: () => void; preview: boolean }) {
  const [type, setType] = useState<"email" | "webhook" | "discord">("email");
  const [target, setTarget] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const comps = sections.flatMap((x) => x.components);
  return (
    <Modal title="Subscribe to updates" onClose={onClose}>
      <div className="mb-4 flex gap-1 rounded-lg border p-1 text-sm" style={{ borderColor: "var(--sr-border)" }}>
        {(["email", "webhook", "discord"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} className="flex-1 cursor-pointer rounded-md py-1.5 capitalize" style={type === t ? { background: "var(--sr-accent)", color: "var(--sr-bg)" } : undefined}>
            {t}
          </button>
        ))}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (preview) return setMsg("Preview mode: subscriptions are disabled.");
          const res = await fetch("/api/v1/subscribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pageId, type, target, componentIds: picked }),
          });
          const j = await res.json().catch(() => ({}));
          setMsg(res.ok ? j.message || "Subscribed!" : j.error || "Something went wrong");
        }}
        className="space-y-3"
      >
        <input
          required
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          type={type === "email" ? "email" : "url"}
          placeholder={type === "email" ? "you@example.com" : type === "discord" ? "https://discord.com/api/webhooks/…" : "https://example.com/hooks/status"}
          className="w-full border px-3 py-2 text-sm outline-none"
          style={fieldStyle}
        />
        {comps.length > 1 && (
          <div className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
            <div className="text-xs" style={{ color: "var(--sr-muted)" }}>Only notify me about (leave empty for all):</div>
            {comps.map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, c.id] : picked.filter((x) => x !== c.id))} />
                {c.name}
              </label>
            ))}
          </div>
        )}
        <button className="w-full cursor-pointer rounded-lg py-2 text-sm font-semibold" style={{ background: "var(--sr-accent)", color: "var(--sr-bg)" }}>
          Subscribe
        </button>
        {msg && <p className="text-sm">{msg}</p>}
        <p className="text-xs" style={{ color: "var(--sr-muted)" }}>
          Prefer feeds? <a className="underline" href={`${base}/feed.rss`}>RSS</a> · <a className="underline" href={`${base}/feed.atom`}>Atom</a> · <a className="underline" href={`${base}/status.json`}>JSON</a>
        </p>
      </form>
    </Modal>
  );
}

function ReportModal({ pageId, components, onClose, preview, title }: { pageId: string; components: ComponentView[]; onClose: () => void; preview: boolean; title: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (preview) return setMsg("Preview mode: reports are disabled.");
          const fd = new FormData(e.currentTarget);
          const res = await fetch("/api/v1/report-issue", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ pageId, componentId: fd.get("componentId") || null, message: fd.get("message"), email: fd.get("email") || null }),
          });
          const j = await res.json().catch(() => ({}));
          setMsg(res.ok ? "Thanks, our team has been notified." : j.error || "Something went wrong");
        }}
      >
        <select name="componentId" className="w-full border px-3 py-2 text-sm" style={fieldStyle}>
          <option value="">Which service?</option>
          {components.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <textarea name="message" required minLength={5} maxLength={2000} rows={4} placeholder="What's going wrong?" className="w-full border px-3 py-2 text-sm" style={fieldStyle} />
        <input name="email" type="email" placeholder="Email (optional)" className="w-full border px-3 py-2 text-sm" style={fieldStyle} />
        <button className="w-full cursor-pointer rounded-lg py-2 text-sm font-semibold" style={{ background: "var(--sr-accent)", color: "var(--sr-bg)" }}>
          Send report
        </button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </Modal>
  );
}
