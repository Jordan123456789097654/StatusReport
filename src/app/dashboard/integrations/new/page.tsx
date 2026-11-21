import { notFound } from "next/navigation";
import { Button, Card, Checkbox, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { CHANNEL_EVENTS, CHANNEL_TYPES } from "@/lib/notify/types";
import { saveChannel } from "../../actions/channels";
import { TEMPLATE_VARIABLES } from "@/lib/template";

export const metadata = { title: "Add integration" };

const HELP: Record<string, { label: string; placeholder: string; hint: string }> = {
  discord: { label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/…", hint: "Server settings → Integrations → Webhooks → Copy URL" },
  slack: { label: "Incoming webhook URL", placeholder: "https://hooks.slack.com/services/…", hint: "Create one at api.slack.com/apps → Incoming Webhooks" },
  teams: { label: "Webhook URL", placeholder: "https://…/workflows/…", hint: "Teams channel → Workflows → Post to a channel when a webhook request is received" },
  webhook: { label: "Endpoint URL", placeholder: "https://example.com/hooks/status", hint: "Receives JSON. Signed with X-StatusReport-Signature when a secret is set." },
  telegram: { label: "Bot token", placeholder: "123456:ABC…", hint: "Create a bot with @BotFather, then add it to your chat" },
  email: { label: "Recipients", placeholder: "oncall@company.com, team@company.com", hint: "Comma separated. Sent via SMTP_URL or RESEND_API_KEY." },
};

export default async function NewIntegration({ searchParams }: { searchParams: Promise<{ type?: string; error?: string }> }) {
  const ctx = await requireWorkspace("admin");
  const sp = await searchParams;
  const type = CHANNEL_TYPES.find((t) => t.value === sp.type);
  if (!type) notFound();
  const monitors = await db.monitor.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const h = HELP[type.value];
  return (
    <>
      <PageHeader title={`Add ${type.label}`} back={{ href: "/dashboard/integrations", label: "Integrations" }} />
      <Flash error={sp.error} />
      <Card className="max-w-3xl">
        <form action={saveChannel} className="space-y-6 p-6">
          <input type="hidden" name="type" value={type.value} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Name">
              <Input name="name" placeholder={type.label} />
            </Field>
            <Field label="Audience" hint={type.value === "discord" ? "Public: community embeds. Private: ops diagnostics and on-call pings." : undefined}>
              <Select name="visibility" defaultValue="private">
                <option value="private">Private (internal ops)</option>
                <option value="public">Public (community-facing)</option>
              </Select>
            </Field>
          </div>
          {type.value === "email" ? (
            <Field label={h.label} hint={h.hint}>
              <Input name="emails" required placeholder={h.placeholder} />
            </Field>
          ) : type.value === "telegram" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Bot token" hint={h.hint}>
                <Input name="botToken" required placeholder={h.placeholder} className="font-mono" />
              </Field>
              <Field label="Chat ID">
                <Input name="chatId" required placeholder="-1001234567890" className="font-mono" />
              </Field>
            </div>
          ) : (
            <Field label={h.label} hint={h.hint}>
              <Input name="url" required placeholder={h.placeholder} className="font-mono" />
            </Field>
          )}
          {type.value === "webhook" && (
            <>
              <Field label="Signing secret" hint="Optional. Adds an HMAC-SHA256 header so your endpoint can verify the sender.">
                <Input name="secret" type="password" autoComplete="off" />
              </Field>
              <Field label="Custom JSON body" hint={`Optional. Use {{variables}}: ${TEMPLATE_VARIABLES.slice(0, 6).map((v) => `{{${v}}}`).join(" ")} …`}>
                <Textarea name="template" rows={6} placeholder={'{"text": "{{incident.title}} ({{monitor.name}})"}'} />
              </Field>
            </>
          )}
          <Field label="Events">
            <div className="grid gap-2 sm:grid-cols-2">
              {CHANNEL_EVENTS.map((e) => (
                <Checkbox key={e.value} name="events" value={e.value} defaultChecked label={e.label} />
              ))}
            </div>
          </Field>
          {monitors.length > 0 && (
            <Field label="Only for these monitors" hint="Leave all unchecked to receive alerts for every monitor">
              <div className="grid max-h-40 gap-2 overflow-y-auto rounded-lg border border-line-strong bg-bg p-3 sm:grid-cols-2">
                {monitors.map((m) => (
                  <Checkbox key={m.id} name="monitorIds" value={m.id} label={m.name} />
                ))}
              </div>
            </Field>
          )}
          <Button variant="primary">Save integration</Button>
        </form>
      </Card>
    </>
  );
}
