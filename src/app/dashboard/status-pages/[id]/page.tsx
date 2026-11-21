import { notFound } from "next/navigation";
import { ArrowDown, ArrowUp, ExternalLink, Trash2 } from "lucide-react";
import { CopyField } from "@/components/CopyButton";
import { CustomDomainCard } from "@/components/CustomDomainCard";
import { PageBuilder } from "@/components/PageBuilder";
import { Button, Card, CardHeader, Checkbox, Field, Flash, Input, LinkButton, PageHeader, Select, Table, Tabs, Textarea } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db, json } from "@/lib/db";
import { env } from "@/lib/env";
import { fmtDate } from "@/lib/format";
import { LOCALES } from "@/lib/i18n";
import { loadViewData, pageConfig } from "@/lib/statuspage";
import type { Block, BarConfig } from "@/lib/blocks";
import type { Tokens } from "@/lib/themes";
import { statusPageBase } from "@/lib/urls";
import {
  addComponent,
  addSection,
  checkDomainStatus,
  deleteStatusPage,
  deleteSubscriber,
  saveCustomDomain,
  saveDesign,
  savePageAccess,
  savePageGeneral,
  updateComponent,
  updateSection,
} from "../../actions/pages";

export const dynamic = "force-dynamic";

const TABS = ["general", "components", "design", "domain", "access", "subscribers", "embed"] as const;
type Tab = (typeof TABS)[number];

export default async function StatusPageSettings({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; error?: string; ok?: string }> }) {
  const ctx = await requireWorkspace();
  const { id } = await params;
  const sp = await searchParams;
  const tab = (TABS.includes(sp.tab as Tab) ? sp.tab : "general") as Tab;
  const page = await db.statusPage.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!page) notFound();
  const base = statusPageBase(page);

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/status-pages", label: "Status pages" }}
        title={page.name}
        description={<span className="font-mono text-xs">{base}</span>}
        actions={
          <LinkButton href={base} target="_blank">
            Open page <ExternalLink size={14} />
          </LinkButton>
        }
      />
      <Tabs
        active={tab}
        tabs={TABS.map((t) => ({
          key: t,
          href: `/dashboard/status-pages/${id}?tab=${t}`,
          label: t === "domain" ? "Custom domain" : t === "embed" ? "Badges & widget" : t[0].toUpperCase() + t.slice(1),
        }))}
      />
      <Flash error={sp.error} ok={sp.ok} />

      {tab === "general" && (
        <>
          <Card>
            <form action={savePageGeneral} className="grid gap-5 p-6 sm:grid-cols-2">
              <input type="hidden" name="id" value={page.id} />
              <Field label="Name">
                <Input name="name" defaultValue={page.name} required />
              </Field>
              <Field label="Slug" hint={`${env.appUrl}/s/${page.slug}`}>
                <Input name="slug" defaultValue={page.slug} required pattern="[a-z0-9][a-z0-9-]{1,48}[a-z0-9]" />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <Textarea name="description" rows={2} defaultValue={page.description} className="font-sans" />
              </Field>
              <Field label="Logo URL">
                <Input name="logoUrl" defaultValue={page.logoUrl ?? ""} placeholder="https://…/logo.svg" />
              </Field>
              <Field label="Favicon URL">
                <Input name="faviconUrl" defaultValue={page.faviconUrl ?? ""} placeholder="https://…/favicon.png" />
              </Field>
              <Field label="Website URL">
                <Input name="websiteUrl" defaultValue={page.websiteUrl ?? ""} placeholder="https://acme.com" />
              </Field>
              <Field label="Default language" hint="Visitors can switch languages from the footer">
                <Select name="locale" defaultValue={page.locale}>
                  {Object.entries(LOCALES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="space-y-3 sm:col-span-2">
                <Checkbox name="subscribersEnabled" defaultChecked={page.subscribersEnabled} label="Allow visitors to subscribe (email, webhook, Discord, RSS)" />
                <Checkbox name="reportIssueEnabled" defaultChecked={page.reportIssueEnabled} label='Show a "Report an issue" button' />
                <Checkbox name="showLatency" defaultChecked={page.showLatency} label="Show response-time charts" />
              </div>
              <div className="sm:col-span-2">
                <Button variant="primary">Save</Button>
              </div>
            </form>
          </Card>
          <Card className="mt-8 border-down/25">
            <CardHeader title="Delete status page" description="The public URL and custom domain stop working immediately." />
            <form action={deleteStatusPage} className="p-5">
              <input type="hidden" name="id" value={page.id} />
              <Button variant="danger">Delete {page.name}</Button>
            </form>
          </Card>
        </>
      )}

      {tab === "components" && <ComponentsTab pageId={page.id} workspaceId={ctx.workspace.id} />}

      {tab === "design" && <DesignTab pageId={page.id} />}

      {tab === "domain" && (
        <CustomDomainCard
          pageId={page.id}
          initialDomain={page.customDomain ?? ""}
          initialStatus={page.domainStatus as "none" | "pending" | "verified" | "failed"}
          initialDetail={page.domainError}
          cnameTarget={env.cnameTarget}
          save={saveCustomDomain}
          check={checkDomainStatus}
        />
      )}

      {tab === "access" && (
        <Card>
          <form action={savePageAccess} className="space-y-5 p-6">
            <input type="hidden" name="id" value={page.id} />
            <Field label="Who can view this page?">
              <Select name="visibility" defaultValue={page.visibility}>
                <option value="public">Public: anyone with the link</option>
                <option value="password">Password protected</option>
                <option value="ip">IP allowlist</option>
                <option value="team">Team members only (signed in)</option>
              </Select>
            </Field>
            <Field label="Password" hint={page.passwordHash ? "A password is set. Enter a new one to change it." : "Required for password-protected pages"}>
              <Input name="password" type="password" autoComplete="new-password" />
            </Field>
            <Field label="IP allowlist" hint="Comma or newline separated IPv4 addresses / CIDR ranges, e.g. 10.0.0.0/8, 203.0.113.7">
              <Textarea name="ipAllowlist" rows={3} defaultValue={page.ipAllowlist} />
            </Field>
            <p className="text-xs text-dim">Private pages are excluded from static snapshots, badges, feeds and OG images.</p>
            <Button variant="primary">Save access settings</Button>
          </form>
        </Card>
      )}

      {tab === "subscribers" && <SubscribersTab pageId={page.id} />}

      {tab === "embed" && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Status badge" description="Live SVG badge for READMEs and docs" />
            <div className="space-y-4 p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${env.appUrl}/badge/${page.slug}.svg`} alt="Status badge" />
              <CopyField value={`![Status](${env.appUrl}/badge/${page.slug}.svg)`} />
              <CopyField value={`![Uptime](${env.appUrl}/badge/${page.slug}.svg?metric=uptime&label=uptime)`} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Floating status widget" description="Drop this into any website to show a live status pill in the corner" />
            <div className="p-5">
              <CopyField value={`<script src="${env.appUrl}/widget.js" data-page="${page.slug}" data-position="bottom-right" async></script>`} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Machine-readable endpoints" />
            <div className="space-y-3 p-5">
              <CopyField value={`${base}/status.json`} />
              <CopyField value={`${base}/feed.rss`} />
              <CopyField value={`${base}/feed.atom`} />
              <CopyField value={`${base}/og-image`} />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

async function ComponentsTab({ pageId, workspaceId }: { pageId: string; workspaceId: string }) {
  const [sections, components, monitors] = await Promise.all([
    db.statusPageSection.findMany({ where: { statusPageId: pageId }, orderBy: { order: "asc" } }),
    db.statusPageComponent.findMany({ where: { statusPageId: pageId }, include: { monitor: true }, orderBy: { order: "asc" } }),
    db.monitor.findMany({ where: { workspaceId }, orderBy: { name: "asc" } }),
  ]);
  const available = monitors.filter((m) => !components.some((c) => c.monitorId === m.id));
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Component groups" description="Collapsible accordion sections with an aggregated status badge" />
        <div className="space-y-3 p-5">
          {sections.map((s) => (
            <form key={s.id} action={updateSection} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="sectionId" value={s.id} />
              <Input name="name" defaultValue={s.name} className="max-w-xs" />
              <Checkbox name="collapsed" defaultChecked={s.collapsed} label="Collapsed by default" />
              <Button>Save</Button>
              <Button name="delete" value="1" variant="ghost">
                <Trash2 size={14} />
              </Button>
            </form>
          ))}
          <form action={addSection} className="flex gap-3">
            <input type="hidden" name="id" value={pageId} />
            <Input name="name" placeholder="e.g. Core platform" className="max-w-xs" />
            <Button>Add group</Button>
          </form>
        </div>
      </Card>

      <Card>
        <CardHeader title="Components" description="Each component is backed by a monitor" />
        <Table head={["Order", "Component", "Group", "Description", "Latency", ""]}>
          {components.map((c, i) => (
            <tr key={c.id}>
              <td className="px-5 py-3">
                <div className="flex gap-1">
                  <form action={updateComponent}>
                    <input type="hidden" name="componentId" value={c.id} />
                    <button name="op" value="up" disabled={i === 0} className="cursor-pointer p-1 text-muted hover:text-fg disabled:opacity-30">
                      <ArrowUp size={14} />
                    </button>
                  </form>
                  <form action={updateComponent}>
                    <input type="hidden" name="componentId" value={c.id} />
                    <button name="op" value="down" disabled={i === components.length - 1} className="cursor-pointer p-1 text-muted hover:text-fg disabled:opacity-30">
                      <ArrowDown size={14} />
                    </button>
                  </form>
                </div>
              </td>
              <td colSpan={4} className="px-5 py-3">
                <form action={updateComponent} className="grid items-center gap-3 sm:grid-cols-[1fr_1fr_1.4fr_auto_auto]">
                  <input type="hidden" name="componentId" value={c.id} />
                  <Input name="displayName" defaultValue={c.displayName ?? ""} placeholder={c.monitor.name} />
                  <Select name="sectionId" defaultValue={c.sectionId ?? ""}>
                    <option value="">No group</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <Input name="description" defaultValue={c.description ?? ""} placeholder="Shown as a tooltip" />
                  <Checkbox name="showLatency" defaultChecked={c.showLatency} label="Latency" />
                  <Button>Save</Button>
                </form>
              </td>
              <td className="px-5 py-3">
                <form action={updateComponent}>
                  <input type="hidden" name="componentId" value={c.id} />
                  <button name="op" value="delete" className="cursor-pointer p-1 text-muted hover:text-down" title="Remove">
                    <Trash2 size={14} />
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
        {available.length > 0 && (
          <form action={addComponent} className="flex flex-wrap gap-3 border-t border-line p-5">
            <input type="hidden" name="id" value={pageId} />
            <Select name="monitorId" className="max-w-xs">
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
            <Select name="sectionId" className="max-w-xs">
              <option value="">No group</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Button>Add component</Button>
          </form>
        )}
      </Card>
    </div>
  );
}

async function DesignTab({ pageId }: { pageId: string }) {
  const page = await db.statusPage.findUniqueOrThrow({ where: { id: pageId } });
  // Always load 90 days so the preview can switch between 30/60/90 instantly.
  const data = await loadViewData({ ...page, barConfig: JSON.stringify({ ...json(page.barConfig, {}), days: 90 }) });
  const config = pageConfig(page);
  return (
    <PageBuilder
      initial={{
        id: page.id,
        theme: page.theme,
        tokens: json<Partial<Tokens>>(page.tokens, {}),
        blocks: json<Block[]>(page.blocks, []),
        barConfig: json<Partial<BarConfig>>(page.barConfig, {}),
        customCss: page.customCss,
        customHead: page.customHead,
        customHeader: page.customHeader,
        customFooter: page.customFooter,
        showLatency: page.showLatency,
      }}
      config={config}
      data={data}
      save={saveDesign}
    />
  );
}

async function SubscribersTab({ pageId }: { pageId: string }) {
  const subs = await db.subscriber.findMany({ where: { statusPageId: pageId }, orderBy: { createdAt: "desc" } });
  return (
    <Card>
      <Table head={["Type", "Target", "Components", "Confirmed", "Since", ""]}>
        {subs.map((s) => (
          <tr key={s.id}>
            <td className="px-5 py-3 capitalize">{s.type}</td>
            <td className="max-w-sm truncate px-5 py-3 font-mono text-xs">{s.type === "email" ? s.target : s.target.replace(/\/[\w-]{20,}$/, "/••••")}</td>
            <td className="px-5 py-3 text-muted">{json<string[]>(s.componentIds, []).length || "All"}</td>
            <td className={`px-5 py-3 ${s.confirmed ? "text-up" : "text-warn"}`}>{s.confirmed ? "Yes" : "Pending"}</td>
            <td className="px-5 py-3 text-muted">{fmtDate(s.createdAt)}</td>
            <td className="px-5 py-3">
              <form action={deleteSubscriber}>
                <input type="hidden" name="subscriberId" value={s.id} />
                <Button variant="ghost" className="text-xs">
                  Remove
                </Button>
              </form>
            </td>
          </tr>
        ))}
        {!subs.length && (
          <tr>
            <td colSpan={6} className="px-5 py-6 text-center text-muted">
              No subscribers yet
            </td>
          </tr>
        )}
      </Table>
    </Card>
  );
}
