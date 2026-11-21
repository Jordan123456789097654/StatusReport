// Cookie sessions (DB-backed, token hashed at rest), RBAC helpers and workspace context.
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Membership, User, Workspace } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { randomToken, sha256 } from "./crypto";
import { clientIp } from "./ratelimit";
import { prefixFromName } from "./notify/context";

const COOKIE = "sr_session";
const MAX_AGE = 30 * 86_400;

import { can, ROLE_RANK, type Role } from "./roles";
export { can, ROLE_RANK, ROLES, type Role } from "./roles";

export async function createSession(userId: string, opts: { pending2fa?: boolean; workspaceId?: string | null } = {}) {
  const token = randomToken(32);
  const h = await headers();
  await db.session.create({
    data: {
      id: sha256(token),
      userId,
      pending2fa: Boolean(opts.pending2fa),
      workspaceId: opts.workspaceId ?? null,
      expiresAt: new Date(Date.now() + MAX_AGE * 1000),
      ip: clientIp(h),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const s = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!s || s.expiresAt < new Date()) return null;
  return s;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(COOKIE);
}

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.pending2fa) redirect("/login/2fa");
  return s;
}

export type WorkspaceCtx = {
  sessionId: string;
  user: User;
  workspace: Workspace;
  membership: Membership;
  role: Role;
};

export async function requireWorkspace(minRole: Role = "viewer"): Promise<WorkspaceCtx> {
  const s = await requireUser();
  let m = s.workspaceId
    ? await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId: s.workspaceId, userId: s.userId } }, include: { workspace: true } })
    : null;
  if (!m) m = await db.membership.findFirst({ where: { userId: s.userId }, include: { workspace: true }, orderBy: { createdAt: "asc" } });
  if (!m) redirect("/onboarding");
  const role = m.role as Role;
  if (!can(role, minRole)) throw new Error(`This action requires the ${minRole} role.`);
  const { workspace, ...membership } = m;
  return { sessionId: s.id, user: s.user, workspace, membership, role };
}

export async function currentIp() {
  return clientIp(await headers());
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workspace";
}

export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>) {
  const root = slugify(base);
  let slug = root;
  for (let i = 2; await exists(slug); i++) slug = `${root}-${i}`;
  return slug;
}

export async function createWorkspaceFor(userId: string, name: string) {
  const slug = await uniqueSlug(name, async (s) => Boolean(await db.workspace.findUnique({ where: { slug: s } })));
  const prefix = prefixFromName(name);
  return db.workspace.create({
    data: { name, slug, incidentPrefix: prefix, memberships: { create: { userId, role: "owner" } } },
  });
}
