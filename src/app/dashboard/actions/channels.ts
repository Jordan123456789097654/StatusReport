"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireWorkspace } from "@/lib/auth";
import { db, json } from "@/lib/db";
import { env } from "@/lib/env";
import { bool, flash, list, str } from "@/lib/forms";
import { isDiscordWebhookUrl, type DiscordTemplate } from "@/lib/notify/discord";
import { sampleContext, sendToChannel } from "@/lib/notify/dispatcher";
import type { NotifyKind } from "@/lib/notify/types";
import { CHANNEL_TYPES } from "@/lib/notify/types";

type Config = { url?: string; botToken?: string; chatId?: string; emails?: string; secret?: string };

function readConfig(type: string, fd: FormData, previous: Config = {}): Config | string {
  const keep = (k: keyof Config) => str(fd, k) || previous[k] || "";
  switch (type) {
    case "discord": {
      const url = keep("url");
      return isDiscordWebhookUrl(url) ? { url } : "Enter a valid Discord webhook URL (https://discord.com/api/webhooks/…)";
    }
    case "slack": {
      const url = keep("url");
      return url.startsWith("https://hooks.slack.com/") ? { url } : "Enter a Slack incoming webhook URL";
    }
    case "teams": {
      const url = keep("url");
      return url.startsWith("https://") ? { url } : "Enter the Teams webhook URL";
    }
    case "webhook": {
      const url = keep("url");
      return /^https?:\/\//.test(url) ? { url, secret: keep("secret") } : "Enter a webhook URL";
    }
    case "telegram": {
      const botToken = keep("botToken");
      const chatId = keep("chatId");
      return botToken && chatId ? { botToken, chatId } : "Bot token and chat ID are required";
    }
    case "email": {
      const emails = str(fd, "emails") || previous.emails || "";
      return emails ? { emails } : "Enter at least one email address";
    }
  }
  return "Unknown channel type";
}

export async function saveChannel(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = str(fd, "id");
  const type = str(fd, "type");
  if (!CHANNEL_TYPES.some((t) => t.value === type)) flash("/dashboard/integrations", "Pick a channel type");
  const existing = id ? await db.alertChannel.findFirst({ where: { id, workspaceId: ctx.workspace.id } }) : null;
  const back = id ? `/dashboard/integrations/${id}` : `/dashboard/integrations/new?type=${type}`;
  const cfg = readConfig(type, fd, json<Config>(existing?.config, {}));
  if (typeof cfg === "string") flash(back, cfg);
  const events = list(fd, "events");
  const monitorIds = (await db.monitor.findMany({ where: { workspaceId: ctx.workspace.id, id: { in: list(fd, "monitorIds") } }, select: { id: true } })).map((m) => m.id);
  const data = {
    name: str(fd, "name") || CHANNEL_TYPES.find((t) => t.value === type)!.label,
    type,
    visibility: str(fd, "visibility") === "public" ? "public" : "private",
    config: JSON.stringify(cfg),
    events: (events.length ? events : ["down", "up", "update", "maintenance", "expiry"]).join(","),
    monitorIds: JSON.stringify(monitorIds),
    enabled: id ? bool(fd, "enabled") : true,
    ...(type === "webhook" ? { template: str(fd, "template") || null } : {}),
  };
  const ch = existing
    ? await db.alertChannel.update({ where: { id: existing.id }, data })
    : await db.alertChannel.create({ data: { ...data, workspaceId: ctx.workspace.id } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: existing ? "integration.update" : "integration.create", target: ch.id, meta: { type, name: ch.name } });
  revalidatePath("/dashboard/integrations");
  redirect(`/dashboard/integrations/${ch.id}?ok=Saved`);
}

export async function saveDiscordTemplate(channelId: string, template: DiscordTemplate): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireWorkspace("admin");
  const ch = await db.alertChannel.findFirst({ where: { id: channelId, workspaceId: ctx.workspace.id } });
  if (!ch || ch.type !== "discord") return { ok: false, error: "Discord channel not found" };
  if (template.rawJson?.trim()) {
    try {
      JSON.parse(template.rawJson);
    } catch (e) {
      return { ok: false, error: `Raw JSON is invalid: ${(e as Error).message}` };
    }
  }
  if (template.avatarUrl && !/^https:\/\//.test(template.avatarUrl)) return { ok: false, error: "Avatar URL must start with https://" };
  await db.alertChannel.update({ where: { id: channelId }, data: { template: JSON.stringify(template) } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "integration.template", target: channelId });
  return { ok: true };
}

export async function sendTestNotification(channelId: string, kind: NotifyKind = "down", template?: DiscordTemplate): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireWorkspace("admin");
  const ch = await db.alertChannel.findFirst({ where: { id: channelId, workspaceId: ctx.workspace.id } });
  if (!ch) return { ok: false, error: "Channel not found" };
  const effective = template && ch.type === "discord" ? { ...ch, template: JSON.stringify(template) } : ch;
  const c = sampleContext(kind, env.appUrl);
  c.workspace.name = ctx.workspace.name;
  const res = await sendToChannel(effective, kind, c);
  await db.notificationLog.create({ data: { workspaceId: ctx.workspace.id, channelId: ch.id, kind: `test:${kind}`, ok: res.ok, error: res.error } });
  return res;
}

export async function deleteChannel(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = str(fd, "id");
  await db.alertChannel.deleteMany({ where: { id, workspaceId: ctx.workspace.id } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "integration.delete", target: id });
  redirect("/dashboard/integrations");
}
