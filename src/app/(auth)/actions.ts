"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { createSession, createWorkspaceFor, destroySession, getSession } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { verifyTotp } from "@/lib/totp";
import { flash, str } from "@/lib/forms";

async function acceptInvite(userId: string, email: string, token: string): Promise<string | null> {
  if (!token) return null;
  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite || invite.expiresAt < new Date() || invite.email.toLowerCase() !== email.toLowerCase()) return null;
  await db.membership.upsert({
    where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
    create: { workspaceId: invite.workspaceId, userId, role: invite.role },
    update: {},
  });
  await db.invite.delete({ where: { id: invite.id } });
  await audit({ workspaceId: invite.workspaceId, userId, actor: email, action: "member.join", meta: { role: invite.role } });
  return invite.workspaceId;
}

export async function register(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const password = String(fd.get("password") || "");
  const invite = str(fd, "invite");
  const back = `/register${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;
  const ip = clientIp(await headers());
  if (!(await rateLimit(`register:${ip}`, 5, 60 * 60_000)).ok) flash(back, "Too many sign-ups from this network. Try again later.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) flash(back, "Enter a valid email address");
  if (password.length < 8) flash(back, "Password must be at least 8 characters");
  if (await db.user.findUnique({ where: { email } })) flash(back, "An account with that email already exists. Sign in instead.");

  const userCount = await db.user.count();
  const pendingInvite = invite ? await db.invite.findUnique({ where: { token: invite } }) : null;
  if (!env.saasMode && userCount > 0 && !pendingInvite) flash(back, "Registration is closed on this instance. Ask an admin for an invite.");

  const user = await db.user.create({ data: { email, name: name || null, passwordHash: hashPassword(password) } });
  let workspaceId = await acceptInvite(user.id, email, invite);
  if (!workspaceId) workspaceId = (await createWorkspaceFor(user.id, str(fd, "workspace") || `${name || email.split("@")[0]}'s workspace`)).id;
  await audit({ workspaceId, userId: user.id, actor: email, action: "auth.register", ip });
  await createSession(user.id, { workspaceId });
  redirect("/dashboard");
}

export async function login(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") || "");
  const ip = clientIp(await headers());
  if (!(await rateLimit(`login:${ip}:${email}`, 8, 15 * 60_000)).ok) flash("/login", "Too many attempts. Wait a few minutes and try again.");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    await audit({ userId: user?.id, actor: email, action: "auth.login_failed", ip });
    flash("/login", "Invalid email or password");
  }
  await createSession(user.id, { pending2fa: user.totpEnabled });
  if (user.totpEnabled) redirect("/login/2fa");
  const m = await db.membership.findFirst({ where: { userId: user.id } });
  await audit({ workspaceId: m?.workspaceId, userId: user.id, actor: email, action: "auth.login", ip });
  redirect("/dashboard");
}

export async function verify2fa(fd: FormData) {
  const s = await getSession();
  if (!s) redirect("/login");
  const ip = clientIp(await headers());
  if (!(await rateLimit(`2fa:${s.id}`, 6, 10 * 60_000)).ok) flash("/login/2fa", "Too many attempts");
  if (!s.user.totpSecret || !verifyTotp(s.user.totpSecret, str(fd, "code"))) {
    await audit({ userId: s.userId, actor: s.user.email, action: "auth.2fa_failed", ip });
    flash("/login/2fa", "That code is not valid");
  }
  await db.session.update({ where: { id: s.id }, data: { pending2fa: false } });
  const m = await db.membership.findFirst({ where: { userId: s.userId } });
  await audit({ workspaceId: m?.workspaceId, userId: s.userId, actor: s.user.email, action: "auth.login", meta: { twoFactor: true }, ip });
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function createWorkspace(fd: FormData) {
  const s = await getSession();
  if (!s || s.pending2fa) redirect("/login");
  const name = str(fd, "name");
  if (!name) flash("/onboarding", "Give your workspace a name");
  const ws = await createWorkspaceFor(s.userId, name);
  await db.session.update({ where: { id: s.id }, data: { workspaceId: ws.id } });
  await audit({ workspaceId: ws.id, userId: s.userId, actor: s.user.email, action: "workspace.create" });
  redirect("/dashboard");
}

export async function switchWorkspace(fd: FormData) {
  const s = await getSession();
  if (!s || s.pending2fa) redirect("/login");
  const id = str(fd, "workspaceId");
  const m = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId: s.userId } } });
  if (m) await db.session.update({ where: { id: s.id }, data: { workspaceId: id } });
  redirect("/dashboard");
}
