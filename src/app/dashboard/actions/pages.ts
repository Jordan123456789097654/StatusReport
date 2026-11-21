"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireWorkspace, uniqueSlug } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { db } from "@/lib/db";
import { normalizeDomain, validateDomain, verifyPageDomain } from "@/lib/domains";
import { addProjectDomain, removeProjectDomain } from "@/lib/vercel";
import { bool, flash, optStr, str } from "@/lib/forms";
import type { Block } from "@/lib/blocks";
import type { BarConfig } from "@/lib/blocks";
import type { Tokens } from "@/lib/themes";
import { THEMES } from "@/lib/themes";
import { LOCALES } from "@/lib/i18n";

async function ownPage(id: string, workspaceId: string) {
  const p = await db.statusPage.findFirst({ where: { id, workspaceId } });
  if (!p) flash("/dashboard/status-pages", "Status page not found");
  return p;
}
const settings = (id: string, tab = "general") => `/dashboard/status-pages/${id}?tab=${tab}`;
const RESERVED_SLUGS = ["api", "admin", "dashboard", "login", "register", "badge", "widget", "www", "app", "status"];

export async function createStatusPage(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const name = str(fd, "name") || `${ctx.workspace.name} Status`;
  const wanted = (str(fd, "slug") || name).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const slug = await uniqueSlug(RESERVED_SLUGS.includes(wanted) ? `${wanted}-status` : wanted, async (s) => Boolean(await db.statusPage.findUnique({ where: { slug: s } })));
  const page = await db.statusPage.create({ data: { workspaceId: ctx.workspace.id, name, slug, theme: "clean-light" } });
  const monitors = await db.monitor.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" }, take: 25 });
  if (monitors.length) {
    await db.statusPageComponent.createMany({ data: monitors.map((m, i) => ({ statusPageId: page.id, monitorId: m.id, order: i })) });
  }
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "statuspage.create", target: page.id, meta: { slug } });
  redirect(settings(page.id));
}

export async function savePageGeneral(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = str(fd, "id");
  const page = await ownPage(id, ctx.workspace.id);
  const slug = str(fd, "slug").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug)) flash(settings(id), "Slug must be 3-50 lowercase letters, digits or dashes");
  if (RESERVED_SLUGS.includes(slug)) flash(settings(id), "That slug is reserved");
  if (slug !== page.slug && (await db.statusPage.findUnique({ where: { slug } }))) flash(settings(id), "That slug is taken");
  const locale = str(fd, "locale");
  await db.statusPage.update({
    where: { id },
    data: {
      name: str(fd, "name") || page.name,
      slug,
      description: str(fd, "description"),
      logoUrl: optStr(fd, "logoUrl"),
      faviconUrl: optStr(fd, "faviconUrl"),
      websiteUrl: optStr(fd, "websiteUrl"),
      locale: locale in LOCALES ? locale : "en",
      subscribersEnabled: bool(fd, "subscribersEnabled"),
      reportIssueEnabled: bool(fd, "reportIssueEnabled"),
      showLatency: bool(fd, "showLatency"),
    },
  });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "statuspage.update", target: id });
  revalidatePath(`/dashboard/status-pages/${id}`);
  flash(settings(id), "Saved", "ok");
}

export async function savePageAccess(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = str(fd, "id");
  const page = await ownPage(id, ctx.workspace.id);
  const visibility = ["public", "password", "ip", "team"].includes(str(fd, "visibility")) ? str(fd, "visibility") : "public";
  const password = String(fd.get("password") || "");
  if (visibility === "password" && !password && !page.passwordHash) flash(settings(id, "access"), "Set a password");
  await db.statusPage.update({
    where: { id },
    data: { visibility, ipAllowlist: str(fd, "ipAllowlist"), ...(password ? { passwordHash: hashPassword(password) } : {}) },
  });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "statuspage.access", target: id, meta: { visibility } });
  flash(settings(id, "access"), "Access settings saved", "ok");
}

export type DesignPayload = {
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

export async function saveDesign(p: DesignPayload): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireWorkspace("admin");
  await ownPage(p.id, ctx.workspace.id);
  if (!THEMES[p.theme]) return { ok: false, error: "Unknown theme" };
  const size = JSON.stringify(p).length;
  if (size > 400_000) return { ok: false, error: "Design is too large (max 400 KB)" };
  await db.statusPage.update({
    where: { id: p.id },
    data: {
      theme: p.theme,
      tokens: JSON.stringify(p.tokens || {}),
      blocks: JSON.stringify((p.blocks || []).slice(0, 40)),
      barConfig: JSON.stringify(p.barConfig || {}),
      customCss: p.customCss || "",
      customHead: p.customHead || "",
      customHeader: p.customHeader || "",
      customFooter: p.customFooter || "",
      showLatency: Boolean(p.showLatency),
    },
  });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "statuspage.design", target: p.id });
  revalidatePath(`/dashboard/status-pages/${p.id}`);
  return { ok: true };
}

export async function addSection(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = str(fd, "id");
  await ownPage(id, ctx.workspace.id);
  const count = await db.statusPageSection.count({ where: { statusPageId: id } });
  await db.statusPageSection.create({ data: { statusPageId: id, name: str(fd, "name") || "New group", order: count, collapsed: bool(fd, "collapsed") } });
  revalidatePath(`/dashboard/status-pages/${id}`);
}

export async function updateSection(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const sectionId = str(fd, "sectionId");
  const s = await db.statusPageSection.findFirst({ where: { id: sectionId, statusPage: { workspaceId: ctx.workspace.id } } });
  if (!s) return;
  if (fd.get("delete")) await db.statusPageSection.delete({ where: { id: sectionId } });
  else await db.statusPageSection.update({ where: { id: sectionId }, data: { name: str(fd, "name") || s.name, collapsed: bool(fd, "collapsed") } });
  revalidatePath(`/dashboard/status-pages/${s.statusPageId}`);
}

export async function addComponent(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = str(fd, "id");
  await ownPage(id, ctx.workspace.id);
  const monitor = await db.monitor.findFirst({ where: { id: str(fd, "monitorId"), workspaceId: ctx.workspace.id } });
  if (!monitor) flash(settings(id, "components"), "Pick a monitor");
  const sectionId = str(fd, "sectionId") || null;
  const count = await db.statusPageComponent.count({ where: { statusPageId: id } });
  await db.statusPageComponent.upsert({
    where: { statusPageId_monitorId: { statusPageId: id, monitorId: monitor.id } },
    create: { statusPageId: id, monitorId: monitor.id, sectionId, order: count, displayName: optStr(fd, "displayName") },
    update: { sectionId },
  });
  revalidatePath(`/dashboard/status-pages/${id}`);
}

export async function updateComponent(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const cid = str(fd, "componentId");
  const c = await db.statusPageComponent.findFirst({ where: { id: cid, statusPage: { workspaceId: ctx.workspace.id } } });
  if (!c) return;
  const op = str(fd, "op");
  if (op === "delete") await db.statusPageComponent.delete({ where: { id: cid } });
  else if (op === "up" || op === "down") {
    const all = await db.statusPageComponent.findMany({ where: { statusPageId: c.statusPageId }, orderBy: { order: "asc" } });
    const idx = all.findIndex((x) => x.id === cid);
    const swap = all[op === "up" ? idx - 1 : idx + 1];
    if (swap) {
      await db.$transaction([
        db.statusPageComponent.update({ where: { id: c.id }, data: { order: swap.order === c.order ? swap.order + (op === "up" ? -1 : 1) : swap.order } }),
        db.statusPageComponent.update({ where: { id: swap.id }, data: { order: c.order } }),
      ]);
    }
  } else {
    await db.statusPageComponent.update({
      where: { id: cid },
      data: { displayName: optStr(fd, "displayName"), description: optStr(fd, "description"), sectionId: str(fd, "sectionId") || null, showLatency: bool(fd, "showLatency") },
    });
  }
  revalidatePath(`/dashboard/status-pages/${c.statusPageId}`);
}

export async function saveCustomDomain(domainInput: string, pageId: string): Promise<{ ok: boolean; error?: string; status?: string; detail?: string }> {
  const ctx = await requireWorkspace("admin");
  const page = await db.statusPage.findFirst({ where: { id: pageId, workspaceId: ctx.workspace.id } });
  if (!page) return { ok: false, error: "Status page not found" };
  const domain = normalizeDomain(domainInput);
  if (!domain) {
    if (page.customDomain) await removeProjectDomain(page.customDomain);
    await db.statusPage.update({ where: { id: pageId }, data: { customDomain: null, domainStatus: "none", domainError: null, domainVerifiedAt: null } });
    await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "domain.remove", target: pageId, meta: { previous: page.customDomain } });
    revalidatePath(`/dashboard/status-pages/${pageId}`);
    return { ok: true, status: "none" };
  }
  const err = validateDomain(domain);
  if (err) return { ok: false, error: err };
  const taken = await db.statusPage.findFirst({ where: { customDomain: domain, id: { not: pageId } } });
  if (taken) return { ok: false, error: "That domain is already connected to another status page" };
  if (domain !== page.customDomain) {
    const added = await addProjectDomain(domain);
    if (!added.ok) return { ok: false, error: `Vercel could not add the domain: ${added.error}` };
    if (page.customDomain) await removeProjectDomain(page.customDomain);
    await db.statusPage.update({ where: { id: pageId }, data: { customDomain: domain, domainStatus: "pending", domainVerifiedAt: null, domainError: null } });
    await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "domain.change", target: pageId, meta: { domain, previous: page.customDomain } });
  }
  const r = await verifyPageDomain(pageId);
  revalidatePath(`/dashboard/status-pages/${pageId}`);
  const fresh = await db.statusPage.findUnique({ where: { id: pageId } });
  return { ok: true, status: fresh?.domainStatus, detail: r.detail };
}

export async function checkDomainStatus(pageId: string): Promise<{ status: string; detail: string | null; checkedAt: string | null }> {
  const ctx = await requireWorkspace("viewer");
  const page = await db.statusPage.findFirst({ where: { id: pageId, workspaceId: ctx.workspace.id } });
  if (!page?.customDomain) return { status: "none", detail: null, checkedAt: null };
  if (page.domainStatus !== "verified") await verifyPageDomain(pageId);
  const fresh = await db.statusPage.findUniqueOrThrow({ where: { id: pageId } });
  return { status: fresh.domainStatus, detail: fresh.domainError, checkedAt: fresh.domainCheckedAt?.toISOString() ?? null };
}

export async function deleteStatusPage(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = str(fd, "id");
  const p = await ownPage(id, ctx.workspace.id);
  if (p.customDomain) await removeProjectDomain(p.customDomain);
  await db.statusPage.delete({ where: { id } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "statuspage.delete", target: id, meta: { slug: p.slug } });
  redirect("/dashboard/status-pages");
}

export async function deleteSubscriber(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const sid = str(fd, "subscriberId");
  const s = await db.subscriber.findFirst({ where: { id: sid, statusPage: { workspaceId: ctx.workspace.id } } });
  if (s) await db.subscriber.delete({ where: { id: sid } });
  if (s) revalidatePath(`/dashboard/status-pages/${s.statusPageId}`);
}
