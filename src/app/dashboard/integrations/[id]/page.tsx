import { notFound } from "next/navigation";
import { Button, Card, CardHeader, Checkbox, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { DiscordTemplateEditor } from "@/components/DiscordTemplateEditor";
import { requireWorkspace } from "@/lib/auth";
import { db, json } from "@/lib/db";
import { env } from "@/lib/env";
import type { DiscordTemplate, DiscordVisibility } from "@/lib/notify/discord";
import { CHANNEL_EVENTS } from "@/lib/notify/types";
import { deleteChannel, saveChannel, saveDiscordTemplate, sendTestNotification } from "../../actions/channels";

export const dynamic = "force-dynamic";

export default async function EditIntegration({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const ctx = await requireWorkspace("admin");
  const { id } = await params;
  const sp = await searchParams;
  const ch = await db.alertChannel.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!ch) notFound();
  const monitors = await db.monitor.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const cfg = json<Record<string, string>>(ch.config, {});
  const scope = json<string[]>(ch.monitorIds, []);
  const events = ch.events.split(",");
  const visibility: DiscordVisibility = ch.visibility === "public" ? "public" : "private";

  return (
    <>
      <PageHeader title={ch.name} back={{ href: "/dashboard/integrations", label: "Integrations" }} description={`${ch.type} · ${ch.visibility === "public" ? "public" : "private"}`} />
      <Flash error={sp.error} ok={sp.ok} />

      <Card className="mb-6 max-w-3xl">
        <CardHeader title="Settings" />
        <form action={saveChannel} className="space-y-5 p-6">
          <input type="hidden" name="id" value={ch.id} />
          <input type="hidden" name="type" value={ch.type} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name">
              <Input name="name" defaultValue={ch.name} />
            </Field>
            <Field label="Audience">
              <Select name="visibility" defaultValue={ch.visibility}>
                <option value="private">Private (internal ops)</option>
                <option value="public">Public (community-facing)</option>
              </Select>
            </Field>
          </div>
          {ch.type === "telegram" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Bot token" hint="Leave blank to keep the saved token">
                <Input name="botToken" type="password" autoComplete="off" placeholder="•••••••• (saved)" />
              </Field>
              <Field label="Chat ID">
                <Input name="chatId" defaultValue={cfg.chatId} />
              </Field>
            </div>
          ) : ch.type === "email" ? (
            <Field label="Recipients">
              <Input name="emails" defaultValue={cfg.emails} />
            </Field>
          ) : (
            <Field label="URL" hint="Leave blank to keep the saved URL">
              <Input name="url" defaultValue={cfg.url} className="font-mono" />
            </Field>
          )}
          {ch.type === "webhook" && (
            <>
              <Field label="Signing secret" hint="Leave blank to keep the saved secret">
                <Input name="secret" type="password" autoComplete="off" />
              </Field>
              <Field label="Custom JSON body">
                <Textarea name="template" rows={6} defaultValue={ch.template ?? ""} />
              </Field>
            </>
          )}
          <Field label="Events">
            <div className="grid gap-2 sm:grid-cols-2">
              {CHANNEL_EVENTS.map((e) => (
                <Checkbox key={e.value} name="events" value={e.value} defaultChecked={events.includes(e.value)} label={e.label} />
              ))}
            </div>
          </Field>
          {monitors.length > 0 && (
            <Field label="Only for these monitors" hint="All unchecked = every monitor">
              <div className="grid max-h-40 gap-2 overflow-y-auto rounded-lg border border-line-strong bg-bg p-3 sm:grid-cols-2">
                {monitors.map((m) => (
                  <Checkbox key={m.id} name="monitorIds" value={m.id} defaultChecked={scope.includes(m.id)} label={m.name} />
                ))}
              </div>
            </Field>
          )}
          <Checkbox name="enabled" defaultChecked={ch.enabled} label="Enabled" />
          <div className="flex justify-between">
            <Button variant="primary">Save</Button>
          </div>
        </form>
      </Card>

      {ch.type === "discord" && (
        <Card className="mb-6 p-6">
          <h2 className="mb-1 font-semibold">{visibility === "public" ? "Public" : "Private"} Discord message template</h2>
          <p className="mb-6 text-sm text-muted">
            {visibility === "public"
              ? "Minimal embeds for your community: red for down, green for recovered, with a View incident button."
              : "Diagnostics for your team: latency breakdown, response snippet, IP, escalation tier and on-call mention."}
          </p>
          <DiscordTemplateEditor
            channelId={ch.id}
            visibility={visibility}
            initial={json<Partial<DiscordTemplate> | null>(ch.template, null)}
            appUrl={env.appUrl}
            sample={{ company: ctx.workspace.name, prefix: ctx.workspace.incidentPrefix, number: ctx.workspace.incidentCounter + 1 }}
            save={saveDiscordTemplate}
            sendTest={sendTestNotification}
          />
        </Card>
      )}

      {ch.type !== "discord" && (
        <Card className="mb-6 max-w-3xl">
          <CardHeader title="Send a test" />
          <form
            action={async () => {
              "use server";
              await sendTestNotification(ch.id, "down");
            }}
            className="p-5"
          >
            <Button>Send test notification</Button>
          </form>
        </Card>
      )}

      <Card className="max-w-3xl border-down/25">
        <CardHeader title="Delete integration" />
        <form action={deleteChannel} className="p-5">
          <input type="hidden" name="id" value={ch.id} />
          <Button variant="danger">Delete {ch.name}</Button>
        </form>
      </Card>
    </>
  );
}
