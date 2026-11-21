"use client";

// Visual status page customizer: drag-and-drop blocks, theme presets, design tokens,
// uptime-bar styling, code injection, and a live preview with outage simulation.
import { useMemo, useState, useTransition } from "react";
import { Eye, EyeOff, GripVertical, Monitor, Plus, Smartphone, Trash2 } from "lucide-react";
import { BLOCK_LIBRARY, resolveBarConfig, type BarConfig, type Block, type BlockType } from "@/lib/blocks";
import { FONTS, resolveTokens, THEMES, type Tokens } from "@/lib/themes";
import type { ComponentStatus, PageConfig, ViewData } from "@/lib/statuspage";
import { StatusPageView } from "./StatusPageView";
import { Button, Checkbox, Field, Input, Select, Textarea, cx } from "./ui";

export type BuilderInitial = {
  id: string;
  theme: string;
  tokens: Partial<Tokens>;
  blocks: Block[];
  barConfig: Partial<BarConfig>;
  customCss: string;
  customHead: string;
  customHeader: string;
  customFooter: string;
  showLatency: boolean;
};

type Tab = "layout" | "theme" | "tokens" | "bars" | "code";

const COLOR_TOKENS: { key: keyof Tokens; label: string }[] = [
  { key: "bg", label: "Background" },
  { key: "surface", label: "Cards" },
  { key: "text", label: "Text" },
  { key: "muted", label: "Muted text" },
  { key: "accent", label: "Accent / buttons" },
  { key: "up", label: "Operational" },
  { key: "degraded", label: "Degraded" },
  { key: "down", label: "Outage" },
  { key: "maintenance", label: "Maintenance" },
  { key: "nodata", label: "No-data bars" },
];

const toHex = (v: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : "#000000");

export function PageBuilder({
  initial,
  config,
  data,
  save,
}: {
  initial: BuilderInitial;
  config: PageConfig;
  data: ViewData;
  save: (p: BuilderInitial) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [s, setS] = useState<BuilderInitial>({ ...initial, blocks: initial.blocks.length ? initial.blocks : config.blocks });
  const [tab, setTab] = useState<Tab>("layout");
  const [drag, setDrag] = useState<number | null>(null);
  const [sim, setSim] = useState<ComponentStatus | "live">("live");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof BuilderInitial>(k: K, v: BuilderInitial[K]) => setS((p) => ({ ...p, [k]: v }));

  const tokens = resolveTokens(s.theme, s.tokens);
  const bars = resolveBarConfig(s.barConfig);
  const previewConfig: PageConfig = { ...config, theme: s.theme, tokens, blocks: s.blocks, bars, showLatency: s.showLatency, customCss: s.customCss, customHeader: s.customHeader, customFooter: s.customFooter };

  const previewData: ViewData = useMemo(() => {
    const sections = data.sections.map((sec, si) => ({
      ...sec,
      status: sim === "live" ? sec.status : si === 0 ? sim : "operational",
      components: sec.components.map((c, ci) => ({
        ...c,
        bars: c.bars.slice(-bars.days),
        showLatency: s.showLatency,
        status: sim === "live" ? c.status : si === 0 && ci === 0 ? sim : "operational",
      })),
    }));
    const firstName = sections[0]?.components[0]?.name || "API";
    return {
      ...data,
      sections,
      overall: sim === "live" ? data.overall : sim,
      activeIncidents:
        sim === "live" || sim === "operational"
          ? data.activeIncidents
          : [
              {
                id: "sim",
                number: 0,
                label: "SIM-1",
                title: sim === "maintenance" ? "Scheduled maintenance" : `${firstName} is experiencing issues`,
                status: "investigating",
                severity: sim,
                startedAt: new Date().toISOString(),
                resolvedAt: null,
                affected: [firstName],
                updates: [{ status: "investigating", html: "<p>We're investigating elevated error rates. <em>(simulated)</em></p>", createdAt: new Date().toISOString() }],
                postmortemHtml: null,
              },
            ],
    };
  }, [data, sim, bars.days, s.showLatency]);

  const moveBlock = (from: number, to: number) => {
    if (from === to) return;
    const next = [...s.blocks];
    const [b] = next.splice(from, 1);
    next.splice(to, 0, b);
    set("blocks", next);
  };
  const addBlock = (type: BlockType) => set("blocks", [...s.blocks, { id: `${type}-${Date.now().toString(36)}`, type, enabled: true, ...(type === "custom-html" ? { html: "<div style=\"text-align:center\">Custom content</div>" } : {}) }]);

  return (
    <div className="grid gap-6 xl:grid-cols-[400px_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-card p-1 text-sm">
          {(["layout", "theme", "tokens", "bars", "code"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cx("flex-1 cursor-pointer rounded-md px-2 py-1.5 capitalize", tab === t ? "bg-white/10 text-fg" : "text-muted hover:text-fg")}>
              {t === "tokens" ? "Design" : t === "bars" ? "Uptime bars" : t}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-line bg-card p-4">
          {tab === "layout" && (
            <div className="space-y-2">
              <p className="mb-3 text-xs text-dim">Drag blocks to reorder. Toggle the eye to hide a block.</p>
              {s.blocks.map((b, i) => {
                const meta = BLOCK_LIBRARY.find((l) => l.type === b.type);
                return (
                  <div
                    key={b.id}
                    draggable
                    onDragStart={() => setDrag(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (drag !== null) moveBlock(drag, i);
                      setDrag(null);
                    }}
                    className={cx("rounded-lg border bg-bg", drag === i ? "border-up/60 opacity-60" : "border-line-strong")}
                  >
                    <div className="flex items-center gap-2 px-2.5 py-2">
                      <GripVertical size={15} className="cursor-grab text-dim" />
                      <span className={cx("flex-1 text-sm", !b.enabled && "text-dim line-through")}>{meta?.label}</span>
                      <button title={b.enabled ? "Hide" : "Show"} onClick={() => set("blocks", s.blocks.map((x, j) => (j === i ? { ...x, enabled: !x.enabled } : x)))} className="cursor-pointer p-1 text-muted hover:text-fg">
                        {b.enabled ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                      <button title="Remove" onClick={() => set("blocks", s.blocks.filter((_, j) => j !== i))} className="cursor-pointer p-1 text-muted hover:text-down">
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {b.type === "custom-html" && (
                      <div className="border-t border-line p-2">
                        <Textarea rows={4} value={b.html || ""} onChange={(e) => set("blocks", s.blocks.map((x, j) => (j === i ? { ...x, html: e.target.value } : x)))} />
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="pt-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-dim">Add block</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {BLOCK_LIBRARY.map((l) => (
                    <button key={l.type} onClick={() => addBlock(l.type)} title={l.description} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line-strong px-2 py-1.5 text-left text-xs text-muted hover:text-fg">
                      <Plus size={12} /> {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "theme" && (
            <div className="grid gap-2">
              {Object.entries(THEMES).map(([key, th]) => (
                <button
                  key={key}
                  onClick={() => setS((p) => ({ ...p, theme: key, tokens: {} }))}
                  className={cx("flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 text-left", s.theme === key ? "border-up/60 bg-up/5" : "border-line-strong hover:border-white/25")}
                >
                  <span className="flex h-10 w-14 shrink-0 flex-col justify-center gap-1 rounded-md border px-1.5" style={{ background: th.tokens.bg, borderColor: th.tokens.border, borderRadius: Math.min(th.tokens.radius, 10) }}>
                    <span className="h-1.5 rounded-full" style={{ background: th.tokens.up }} />
                    <span className="h-1.5 w-2/3 rounded-full" style={{ background: th.tokens.surface === th.tokens.bg ? th.tokens.muted : th.tokens.surface }} />
                  </span>
                  <span className="text-sm">{th.label}</span>
                </button>
              ))}
            </div>
          )}

          {tab === "tokens" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {COLOR_TOKENS.map((c) => (
                  <label key={c.key} className="text-xs text-muted">
                    {c.label}
                    <span className="mt-1 flex items-center gap-1.5">
                      <input type="color" value={toHex(String(tokens[c.key]))} onChange={(e) => set("tokens", { ...s.tokens, [c.key]: e.target.value })} className="h-8 w-9 shrink-0 cursor-pointer rounded border border-line-strong bg-bg" />
                      <input value={String(tokens[c.key])} onChange={(e) => set("tokens", { ...s.tokens, [c.key]: e.target.value })} className="sr-input px-2 py-1 font-mono text-[11px]" />
                    </span>
                  </label>
                ))}
              </div>
              <Field label={`Border radius: ${tokens.radius}px`}>
                <input type="range" min={0} max={24} value={tokens.radius} onChange={(e) => set("tokens", { ...s.tokens, radius: Number(e.target.value) })} className="w-full accent-[#22C55E]" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Font (Google Fonts)">
                  <Select value={tokens.font} onChange={(e) => set("tokens", { ...s.tokens, font: e.target.value })}>
                    {FONTS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Shadow depth">
                  <Select value={tokens.shadow} onChange={(e) => set("tokens", { ...s.tokens, shadow: e.target.value as Tokens["shadow"] })}>
                    <option value="none">None</option>
                    <option value="sm">Subtle</option>
                    <option value="lg">Deep</option>
                  </Select>
                </Field>
              </div>
              <Field label={`Background blur: ${tokens.blur}px`} hint="Glassmorphism effect on cards">
                <input type="range" min={0} max={30} value={tokens.blur} onChange={(e) => set("tokens", { ...s.tokens, blur: Number(e.target.value) })} className="w-full accent-[#22C55E]" />
              </Field>
              <button onClick={() => set("tokens", {})} className="cursor-pointer text-xs text-muted underline">
                Reset to theme defaults
              </button>
            </div>
          )}

          {tab === "bars" && (
            <div className="space-y-4">
              <Field label="History length">
                <Select value={bars.days} onChange={(e) => set("barConfig", { ...s.barConfig, days: Number(e.target.value) as BarConfig["days"] })}>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </Select>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Height">
                  <Input type="number" min={8} max={80} value={bars.height} onChange={(e) => set("barConfig", { ...s.barConfig, height: Number(e.target.value) })} />
                </Field>
                <Field label="Gap">
                  <Input type="number" min={0} max={8} value={bars.gap} onChange={(e) => set("barConfig", { ...s.barConfig, gap: Number(e.target.value) })} />
                </Field>
                <Field label="Radius">
                  <Input type="number" min={0} max={20} value={bars.radius} onChange={(e) => set("barConfig", { ...s.barConfig, radius: Number(e.target.value) })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Green at ≥ %">
                  <Input type="number" step="0.01" value={bars.upThreshold} onChange={(e) => set("barConfig", { ...s.barConfig, upThreshold: Number(e.target.value) })} />
                </Field>
                <Field label="Amber at ≥ %" hint="Below this is red">
                  <Input type="number" step="0.01" value={bars.degradedThreshold} onChange={(e) => set("barConfig", { ...s.barConfig, degradedThreshold: Number(e.target.value) })} />
                </Field>
              </div>
              <Field label="Tooltip format" hint="{date} {uptime} {incidents}">
                <Input value={bars.tooltip} onChange={(e) => set("barConfig", { ...s.barConfig, tooltip: e.target.value })} />
              </Field>
              <Checkbox checked={s.showLatency} onChange={(e) => set("showLatency", e.target.checked)} label="Show response-time charts" />
            </div>
          )}

          {tab === "code" && (
            <div className="space-y-4">
              <Field label="Custom CSS" hint="Applies everywhere. Target .sr-page and the --sr-* variables.">
                <Textarea rows={7} value={s.customCss} onChange={(e) => set("customCss", e.target.value)} placeholder={".sr-page { --sr-accent: #ff4f00; }"} />
              </Field>
              <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
                Custom HTML and scripts below run only on your verified custom domain, never on the shared statusreport.roleflow.site origin.
              </p>
              <Field label="<head> tags / analytics">
                <Textarea rows={4} value={s.customHead} onChange={(e) => set("customHead", e.target.value)} placeholder="<script defer data-domain=… src=…></script>" />
              </Field>
              <Field label="Header HTML">
                <Textarea rows={4} value={s.customHeader} onChange={(e) => set("customHeader", e.target.value)} />
              </Field>
              <Field label="Footer HTML">
                <Textarea rows={4} value={s.customFooter} onChange={(e) => set("customFooter", e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await save(s);
                setMsg({ ok: r.ok, text: r.ok ? "Design published" : r.error || "Failed to save" });
              })
            }
          >
            {pending ? "Saving…" : "Save & publish"}
          </Button>
          {msg && <span className={cx("text-sm", msg.ok ? "text-up" : "text-down")}>{msg.text}</span>}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-line bg-card p-1 text-xs">
            {(["live", "operational", "degraded", "partial", "major", "maintenance"] as const).map((v) => (
              <button key={v} onClick={() => setSim(v)} className={cx("cursor-pointer rounded-md px-2 py-1 capitalize", sim === v ? "bg-white/10 text-fg" : "text-muted")}>
                {v === "live" ? "Live data" : v === "major" ? "Simulate outage" : v}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            <button onClick={() => setDevice("desktop")} className={cx("cursor-pointer rounded-md p-1.5", device === "desktop" ? "bg-white/10" : "text-muted")} title="Desktop">
              <Monitor size={15} />
            </button>
            <button onClick={() => setDevice("mobile")} className={cx("cursor-pointer rounded-md p-1.5", device === "mobile" ? "bg-white/10" : "text-muted")} title="Mobile">
              <Smartphone size={15} />
            </button>
          </div>
        </div>
        <div className={cx("mx-auto overflow-hidden rounded-xl border border-line-strong transition-all", device === "mobile" ? "max-w-[390px]" : "")}>
          <div className="flex items-center gap-1.5 border-b border-line bg-card-2 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-3 truncate font-mono text-xs text-dim">{data.baseUrl}</span>
          </div>
          <div className="max-h-[78vh] overflow-y-auto sr-scroll">
            {s.customCss && <style dangerouslySetInnerHTML={{ __html: s.customCss.replace(/<\/style/gi, "") }} />}
            <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(tokens.font).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`} />
            <StatusPageView data={previewData} config={previewConfig} allowCustomHtml={false} preview />
          </div>
        </div>
      </div>
    </div>
  );
}
