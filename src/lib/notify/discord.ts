// Dual-tier Discord engine.
//  • Public  = community-facing, minimal Better Stack-style embeds.
//  • Private = internal ops: latency breakdown, response snippet, IP, escalation tier, on-call mention,
//              and Acknowledge links.
// Both are fully customisable through a DiscordTemplate (visual editor) or a raw JSON override.
import { renderDeep, renderTemplate } from "../template";
import type { NotifyContext, NotifyKind, SendResult } from "./types";

export type DiscordVisibility = "public" | "private";

export type DiscordTemplate = {
  username: string;
  avatarUrl: string;
  content: string;
  mention: string; // e.g. <@&123456789> (role) or <@123456789> (user)
  colors: { down: string; up: string; update: string; maintenance: string; expiry: string };
  titles: { down: string; up: string; update: string; grouped: string; maintenance: string; expiry: string };
  fields: {
    error: boolean;
    monitor: boolean;
    duration: boolean;
    region: boolean;
    latency: boolean;
    response: boolean;
    ip: boolean;
    escalation: boolean;
  };
  buttons: { view: boolean; viewLabel: string; ack: boolean; ackLabel: string };
  footer: string;
  rawJson: string; // when non-empty, replaces the generated payload entirely ({{variables}} are rendered)
};

const BASE: DiscordTemplate = {
  username: "Service Updates",
  avatarUrl: "",
  content: "",
  mention: "",
  colors: { down: "#EF4444", up: "#22C55E", update: "#F59E0B", maintenance: "#3B82F6", expiry: "#F59E0B" },
  titles: {
    down: "🔴 Incident #{{incident.id}} created - {{monitor.name}} is down",
    up: "🟢 Incident #{{incident.id}} recovered - {{monitor.name}} is up",
    update: "🟡 Incident #{{incident.id}} - {{update.status}}",
    grouped: "🟠 {{monitor.name}} is also down - grouped into #{{incident.id}}",
    maintenance: "🔵 Maintenance - {{maintenance.title}}",
    expiry: "⚠️ {{expiry.kind}} for {{monitor.name}} expires in {{expiry.days}} days",
  },
  fields: { error: true, monitor: true, duration: true, region: false, latency: false, response: false, ip: false, escalation: false },
  buttons: { view: true, viewLabel: "View incident", ack: false, ackLabel: "Acknowledge" },
  footer: "",
  rawJson: "",
};

export const DEFAULT_DISCORD_TEMPLATES: Record<DiscordVisibility, DiscordTemplate> = {
  public: BASE,
  private: {
    ...BASE,
    username: "StatusReport Ops",
    fields: { error: true, monitor: true, duration: true, region: true, latency: true, response: true, ip: true, escalation: true },
    buttons: { view: true, viewLabel: "Open in dashboard", ack: true, ackLabel: "Acknowledge" },
    footer: "Escalation tier {{escalation.tier}} · {{workspace.name}}",
  },
};

/** Fill any missing keys of a stored template with defaults (templates saved by older versions). */
export function normalizeTemplate(t: Partial<DiscordTemplate> | null | undefined, visibility: DiscordVisibility): DiscordTemplate {
  const d = DEFAULT_DISCORD_TEMPLATES[visibility];
  return {
    ...d,
    ...(t || {}),
    colors: { ...d.colors, ...(t?.colors || {}) },
    titles: { ...d.titles, ...(t?.titles || {}) },
    fields: { ...d.fields, ...(t?.fields || {}) },
    buttons: { ...d.buttons, ...(t?.buttons || {}) },
  };
}

export type DiscordEmbed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
};

export type DiscordPayload = {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds?: DiscordEmbed[];
  components?: { type: 1; components: { type: 2; style: 5; label: string; url: string }[] }[];
  allowed_mentions?: { parse: string[] };
};

const hex = (c: string) => parseInt(c.replace("#", ""), 16) || 0;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function colorFor(kind: NotifyKind, t: DiscordTemplate) {
  if (kind === "up") return t.colors.up;
  if (kind === "update") return t.colors.update;
  if (kind === "maintenance") return t.colors.maintenance;
  if (kind === "expiry") return t.colors.expiry;
  return t.colors.down;
}

function titleFor(kind: NotifyKind, t: DiscordTemplate) {
  if (kind === "test") return t.titles.down;
  return t.titles[kind];
}

export function buildDiscordPayload(
  template: DiscordTemplate,
  visibility: DiscordVisibility,
  kind: NotifyKind,
  ctx: NotifyContext,
): DiscordPayload {
  const t = template;
  if (t.rawJson.trim()) {
    try {
      return renderDeep(JSON.parse(t.rawJson), ctx as unknown as Record<string, unknown>) as DiscordPayload;
    } catch {
      // fall through to the generated payload if the raw JSON is invalid
    }
  }
  const r = (s: string) => renderTemplate(s, ctx as unknown as Record<string, unknown>);
  const isPrivate = visibility === "private";
  const fields: NonNullable<DiscordEmbed["fields"]> = [];
  const add = (name: string, value: string, inline = false) => {
    if (value.trim()) fields.push({ name, value: clip(value, 1024), inline });
  };

  let description = "";
  if (kind === "update") description = ctx.update.message;
  if (kind === "maintenance") {
    description = `${ctx.maintenance.description}\n\n**Window:** ${ctx.maintenance.starts_at} → ${ctx.maintenance.ends_at}`.trim();
  }

  if (["down", "up", "grouped", "test", "expiry"].includes(kind)) {
    if (t.fields.error && kind !== "expiry") add("Error", ctx.error.message || "—");
    if (t.fields.monitor) add("Affected monitor", r("{{monitor.name}} - {{monitor.protocol}} {{monitor.method}} {{monitor.url}}").replace(/\s+/g, " "));
    if (t.fields.duration && kind === "up" && ctx.duration) add("Downtime", ctx.duration, true);
    if (isPrivate) {
      if (t.fields.region && ctx.region) add("Region", ctx.region, true);
      if (t.fields.latency && ctx.latency.total !== "") {
        add(
          "Latency breakdown",
          `\`DNS ${ctx.latency.dns}ms · TCP ${ctx.latency.tcp}ms · TLS ${ctx.latency.tls}ms · TTFB ${ctx.latency.ttfb}ms · Total ${ctx.latency.total}ms\``,
        );
      }
      if (t.fields.response && (ctx.response.status_code || ctx.response.snippet)) {
        add("Response", `HTTP ${ctx.response.status_code || "—"}\n\`\`\`\n${clip(ctx.response.snippet || "(empty body)", 700)}\n\`\`\``);
      }
      if (t.fields.ip && ctx.resolved_ip) add("Resolved IP", `\`${ctx.resolved_ip}\``, true);
      if (t.fields.escalation && ctx.escalation.tier) add("Escalation tier", String(ctx.escalation.tier), true);
    }
  }

  const embed: DiscordEmbed = {
    title: clip(r(titleFor(kind, t)), 256),
    color: hex(colorFor(kind, t)),
    fields,
    timestamp: new Date().toISOString(),
  };
  if (description) embed.description = clip(description, 4000);
  if (t.footer.trim()) embed.footer = { text: clip(r(t.footer), 2048) };

  const viewUrl = isPrivate ? ctx.incident.dashboard_url : ctx.incident.url || ctx.status_page.url;
  const buttons: { type: 2; style: 5; label: string; url: string }[] = [];
  if (t.buttons.view && viewUrl) buttons.push({ type: 2, style: 5, label: clip(r(t.buttons.viewLabel), 80), url: viewUrl });
  if (isPrivate && t.buttons.ack && ctx.incident.ack_url && (kind === "down" || kind === "test")) {
    buttons.push({ type: 2, style: 5, label: clip(r(t.buttons.ackLabel), 80), url: ctx.incident.ack_url });
  }

  const mention = isPrivate ? [r(t.mention), ctx.oncall.mention].filter(Boolean).join(" ") : "";
  const content = [mention, r(t.content)].filter((s) => s.trim()).join(" ");

  return {
    username: r(t.username) || undefined,
    avatar_url: t.avatarUrl || undefined,
    content: content || undefined,
    embeds: [embed],
    components: buttons.length ? [{ type: 1, components: buttons }] : undefined,
    allowed_mentions: { parse: isPrivate ? ["roles", "users"] : [] },
  };
}

export const isDiscordWebhookUrl = (url: string) =>
  /^https:\/\/((canary|ptb)\.)?(discord|discordapp)\.com\/api\/(v\d+\/)?webhooks\/\d+\/[\w-]+/.test(url);

export async function sendDiscord(url: string, payload: DiscordPayload): Promise<SendResult> {
  if (!isDiscordWebhookUrl(url)) return { ok: false, error: "Not a Discord webhook URL" };
  const post = (body: DiscordPayload, withComponents: boolean) =>
    fetch(`${url}${url.includes("?") ? "&" : "?"}wait=true${withComponents ? "&with_components=true" : ""}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  try {
    let res = await post(payload, Boolean(payload.components));
    if (!res.ok && res.status === 400 && payload.components) {
      // Older/non-app webhooks may reject components: fall back to inline links.
      const links = payload.components.flatMap((row) => row.components).map((b) => `[${b.label} ↗](${b.url})`).join("  ·  ");
      const embeds = (payload.embeds || []).map((e, i) => (i === 0 ? { ...e, description: [e.description, links].filter(Boolean).join("\n\n") } : e));
      res = await post({ ...payload, components: undefined, embeds }, false);
    }
    if (!res.ok) return { ok: false, error: `Discord responded ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
