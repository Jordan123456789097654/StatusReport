"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { generateApiKey } from "@/lib/apiauth";
import { requireWorkspace, ROLE_RANK, type Role } from "@/lib/auth";
import { importWorkspace } from "@/lib/backup";
import { randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { flash, list, num, str } from "@/lib/forms";
import { generateTotpSecret, verifyTotp } from "@/lib/totp";

const BACK = "/dashboard/team";

export async function inviteMember(_prev: unknown, fd: FormData): Promise<{ link?: string; error?: string }> {
  const ctx = await requireWorkspace("admin");
  const email = str(fd, "email").toLowerCase();
  const role = str(fd, "role") as Role;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email" };
  if (!(role in ROLE_RANK)) return { error: "Pick a role" };
  if (role === "owner" && ctx.role !== "owner") return { error: "Only owners can invite owners" };
  const token = randomToken(24);
  await db.invite.create({ data: { workspaceId: ctx.workspace.id, email, role, token, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "member.invite", meta: { email, role } });
  revalidatePath(BACK);
  return { link: `${env.appUrl}/register?invite=${token}` };
}

export async function changeRole(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const membershipId = str(fd, "membershipId");
  const role = str(fd, "role") as Role;
  const m = await db.membership.findFirst({ where: { id: membershipId, workspaceId: ctx.workspace.id } });
  if (!m || !(role in ROLE_RANK)) return;
  if ((m.role === "owner" || role === "owner") && ctx.role !== "owner") flash(BACK, "Only owners can change owner roles");
  if (m.role === "owner" && role !== "owner" && (await db.membership.count({ where: { workspaceId: ctx.workspace.id, role: "owner" } })) <= 1) {
    flash(BACK, "A workspace needs at least one owner");
  }
  await db.membership.update({ where: { id: m.id }, data: { role } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "member.role", target: m.userId, meta: { role } });
  revalidatePath(BACK);
}

export async function removeMember(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const m = await db.membership.findFirst({ where: { id: str(fd, "membershipId"), workspaceId: ctx.workspace.id } });
  if (!m) return;
  if (m.role === "owner" && ctx.role !== "owner") flash(BACK, "Only owners can remove owners");
  if (m.role === "owner" && (await db.membership.count({ where: { workspaceId: ctx.workspace.id, role: "owner" } })) <= 1) flash(BACK, "A workspace needs at least one owner");
  await db.membership.delete({ where: { id: m.id } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "member.remove", target: m.userId });
  revalidatePath(BACK);
}

export async function revokeInvite(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  await db.invite.deleteMany({ where: { id: str(fd, "id"), workspaceId: ctx.workspace.id } });
  revalidatePath(BACK);
}

export async function createApiKey(_prev: unknown, fd: FormData): Promise<{ key?: string; error?: string }> {
  const ctx = await requireWorkspace("admin");
  const name = str(fd, "name");
  if (!name) return { error: "Name the key (e.g. GitHub Actions)" };
  const scopes = list(fd, "scopes").filter((s) => ["read", "write", "deployments"].includes(s));
  const k = generateApiKey();
  await db.apiKey.create({ data: { workspaceId: ctx.workspace.id, name, prefix: k.prefix, hash: k.hash, scopes: (scopes.length ? scopes : ["read"]).join(","), createdById: ctx.user.id } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "apikey.create", meta: { name, scopes } });
  revalidatePath("/dashboard/integrations");
  return { key: k.key };
}

export async function deleteApiKey(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  await db.apiKey.deleteMany({ where: { id: str(fd, "id"), workspaceId: ctx.workspace.id } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "apikey.delete", target: str(fd, "id") });
  revalidatePath("/dashboard/integrations");
}

export async function saveWorkspace(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const prefix = str(fd, "incidentPrefix").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  await db.workspace.update({
    where: { id: ctx.workspace.id },
    data: { name: str(fd, "name") || ctx.workspace.name, incidentPrefix: prefix || ctx.workspace.incidentPrefix, groupingWindowSec: Math.max(0, Math.min(3600, num(fd, "groupingWindowSec", 300))) },
  });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "workspace.update" });
  flash(BACK, "Workspace settings saved", "ok");
}

export async function saveProfile(fd: FormData) {
  const ctx = await requireWorkspace("viewer");
  const discord = str(fd, "discordUserId");
  if (discord && !/^\d{15,22}$/.test(discord)) flash(BACK, "Discord user ID must be the numeric ID (enable Developer Mode → Copy User ID)");
  await db.user.update({ where: { id: ctx.user.id }, data: { name: str(fd, "name") || null, discordUserId: discord || null } });
  flash(BACK, "Profile saved", "ok");
}

export async function start2fa() {
  const ctx = await requireWorkspace("viewer");
  if (ctx.user.totpEnabled) return;
  await db.user.update({ where: { id: ctx.user.id }, data: { totpSecret: generateTotpSecret() } });
  revalidatePath(BACK);
}

export async function enable2fa(fd: FormData) {
  const ctx = await requireWorkspace("viewer");
  if (!ctx.user.totpSecret || !verifyTotp(ctx.user.totpSecret, str(fd, "code"))) flash(BACK, "That code didn't match. Check your device clock and try again.");
  await db.user.update({ where: { id: ctx.user.id }, data: { totpEnabled: true } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "auth.2fa_enabled" });
  flash(BACK, "Two-factor authentication is on", "ok");
}

export async function disable2fa(fd: FormData) {
  const ctx = await requireWorkspace("viewer");
  if (!ctx.user.totpSecret || !verifyTotp(ctx.user.totpSecret, str(fd, "code"))) flash(BACK, "Enter a current code to turn off 2FA");
  await db.user.update({ where: { id: ctx.user.id }, data: { totpEnabled: false, totpSecret: null } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "auth.2fa_disabled" });
  flash(BACK, "Two-factor authentication is off", "ok");
}

export async function importBackup(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) flash(BACK, "Choose a backup file");
  if (file.size > 20 * 1024 * 1024) flash(BACK, "Backup is larger than 20 MB");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    flash(BACK, "That file is not valid JSON");
  }
  let summary;
  try {
    summary = await importWorkspace(ctx.workspace.id, parsed);
  } catch (e) {
    flash(BACK, (e as Error).message);
  }
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "workspace.import", meta: summary });
  flash(BACK, `Imported ${summary.monitors} monitors, ${summary.pages} status pages, ${summary.channels} integrations and ${summary.incidents} incidents`, "ok");
}
