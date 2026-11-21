// Slack, Telegram, Microsoft Teams, email and generic webhook senders.
import { createHmac } from "node:crypto";
import { env } from "../env";
import { escapeHtml } from "../markdown";
import { resolveGuarded, friendlyError } from "../monitoring/netguard";
import { renderDeep } from "../template";
import type { NotifyContext, NotifyKind, SendResult } from "./types";

export type Summary = { title: string; lines: string[]; color: string; url: string };

export function summarize(kind: NotifyKind, ctx: NotifyContext): Summary {
  const inc = `#${ctx.incident.id}`;
  const monitorLine = `${ctx.monitor.name} - ${ctx.monitor.protocol} ${ctx.monitor.method} ${ctx.monitor.url}`.replace(/\s+/g, " ").trim();
  const url = ctx.incident.dashboard_url || ctx.incident.url || ctx.status_page.url;
  switch (kind) {
    case "up":
      return { title: `Incident ${inc} recovered - ${ctx.monitor.name} is up`, lines: [`Downtime: ${ctx.duration}`, `Affected monitor: ${monitorLine}`], color: "#22C55E", url };
    case "update":
      return { title: `Incident ${inc} - ${ctx.update.status}`, lines: [ctx.update.message], color: "#F59E0B", url };
    case "grouped":
      return { title: `${ctx.monitor.name} is also down - grouped into ${inc}`, lines: [`Error: ${ctx.error.message}`], color: "#F97316", url };
    case "maintenance":
      return {
        title: `Maintenance - ${ctx.maintenance.title}`,
        lines: [ctx.maintenance.description, `Window: ${ctx.maintenance.starts_at} → ${ctx.maintenance.ends_at}`].filter(Boolean),
        color: "#3B82F6",
        url: ctx.status_page.url,
      };
    case "expiry":
      return { title: `${ctx.expiry.kind} for ${ctx.monitor.name} expires in ${ctx.expiry.days} days`, lines: [`Expires: ${ctx.expiry.date}`], color: "#F59E0B", url };
    default:
      return { title: `Incident ${inc} created - ${ctx.monitor.name} is down`, lines: [`Error: ${ctx.error.message}`, `Affected monitor: ${monitorLine}`], color: "#EF4444", url };
  }
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}): Promise<SendResult> {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return { ok: false, error: "Webhook URL must be http(s)" };
    await resolveGuarded(u.hostname);
    const text = JSON.stringify(body);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "StatusReport-Webhook/1.0", ...headers },
      body: text,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}

export function sendSlack(url: string, s: Summary): Promise<SendResult> {
  if (!/^https:\/\/hooks\.slack\.com\//.test(url)) return Promise.resolve({ ok: false, error: "Not a Slack webhook URL" });
  return postJson(url, {
    text: s.title,
    attachments: [
      {
        color: s.color,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: `*${s.title}*\n${s.lines.join("\n")}` } },
          ...(s.url ? [{ type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "View incident" }, url: s.url }] }] : []),
        ],
      },
    ],
  });
}

export function sendTeams(url: string, s: Summary): Promise<SendResult> {
  // Works with both legacy connectors and Power Automate "Workflows" webhooks.
  return postJson(url, {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", size: "Medium", weight: "Bolder", text: s.title, wrap: true, color: s.color === "#22C55E" ? "Good" : "Attention" },
            ...s.lines.map((l) => ({ type: "TextBlock", text: l, wrap: true })),
          ],
          actions: s.url ? [{ type: "Action.OpenUrl", title: "View incident", url: s.url }] : [],
        },
      },
    ],
  });
}

export async function sendTelegram(botToken: string, chatId: string, s: Summary): Promise<SendResult> {
  if (!/^\d+:[\w-]+$/.test(botToken)) return { ok: false, error: "Invalid Telegram bot token" };
  const text = `<b>${escapeHtml(s.title)}</b>\n${s.lines.map(escapeHtml).join("\n")}${s.url ? `\n\n<a href="${escapeHtml(s.url)}">View incident</a>` : ""}`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `Telegram ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function sendEmail(to: string[], subject: string, html: string, text: string): Promise<SendResult> {
  const recipients = to.map((t) => t.trim()).filter((t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t));
  if (!recipients.length) return { ok: false, error: "No valid recipients" };
  try {
    if (env.resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.resendKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: env.emailFrom, to: recipients, subject, html, text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
      return { ok: true };
    }
    if (env.smtpUrl) {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport(env.smtpUrl);
      await transport.sendMail({ from: env.emailFrom, to: recipients, subject, html, text });
      return { ok: true };
    }
    console.log(`[email:dev] to=${recipients.join(",")} subject="${subject}"\n${text}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function emailFor(s: Summary, footerHtml = ""): { subject: string; html: string; text: string } {
  const html = `<!doctype html><html><body style="margin:0;background:#0B0D12;font-family:Inter,Arial,sans-serif;color:#E6E8EE">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<div style="background:#13161F;border:1px solid rgba(255,255,255,.08);border-left:4px solid ${s.color};border-radius:10px;padding:20px">
<h2 style="margin:0 0 12px;font-size:17px">${escapeHtml(s.title)}</h2>
${s.lines.map((l) => `<p style="margin:6px 0;color:#A1A6B4;font-size:14px">${escapeHtml(l)}</p>`).join("")}
${s.url ? `<p style="margin:18px 0 0"><a href="${escapeHtml(s.url)}" style="background:#22C55E;color:#0B0D12;padding:9px 14px;border-radius:7px;text-decoration:none;font-weight:600;font-size:14px">View incident</a></p>` : ""}
</div>${footerHtml}</div></body></html>`;
  return { subject: s.title, html, text: `${s.title}\n\n${s.lines.join("\n")}\n\n${s.url}` };
}

export function sendGenericWebhook(url: string, kind: NotifyKind, ctx: NotifyContext, template: string | null, secret?: string): Promise<SendResult> {
  let body: unknown = {
    event: kind,
    timestamp: new Date().toISOString(),
    incident: ctx.incident,
    monitor: ctx.monitor,
    error: ctx.error,
    update: ctx.update,
    region: ctx.region,
    status_page: ctx.status_page,
    latency: ctx.latency,
  };
  if (template?.trim()) {
    try {
      body = renderDeep(JSON.parse(template), ctx as unknown as Record<string, unknown>);
    } catch {
      /* keep default body */
    }
  }
  const headers: Record<string, string> = { "x-statusreport-event": kind };
  if (secret) headers["x-statusreport-signature"] = `sha256=${createHmac("sha256", secret).update(JSON.stringify(body)).digest("hex")}`;
  return postJson(url, body, headers);
}
