"use client";

import { useMemo, useState, useTransition } from "react";
import { buildDiscordPayload, normalizeTemplate, type DiscordTemplate, type DiscordVisibility } from "@/lib/notify/discord";
import { sampleContext } from "@/lib/notify/context";
import { TEMPLATE_VARIABLES } from "@/lib/template";
import type { NotifyKind } from "@/lib/notify/types";
import { DiscordPreview } from "./DiscordPreview";
import { Button, Card, CardHeader, Checkbox, Field, Input, Select, Textarea } from "./ui";

const EVENTS: { value: NotifyKind; label: string }[] = [
  { value: "down", label: "Monitor down" },
  { value: "up", label: "Recovered" },
  { value: "update", label: "Timeline update" },
  { value: "grouped", label: "Grouped failure" },
  { value: "maintenance", label: "Maintenance" },
  { value: "expiry", label: "SSL / domain expiry" },
];

const FIELD_LABELS: Record<keyof DiscordTemplate["fields"], { label: string; privateOnly?: boolean }> = {
  error: { label: "Error" },
  monitor: { label: "Affected monitor" },
  duration: { label: "Downtime (recovery)" },
  region: { label: "Region", privateOnly: true },
  latency: { label: "Latency breakdown (DNS/TCP/TLS/TTFB)", privateOnly: true },
  response: { label: "HTTP response snippet", privateOnly: true },
  ip: { label: "Resolved IP", privateOnly: true },
  escalation: { label: "Escalation tier", privateOnly: true },
};

export function DiscordTemplateEditor({
  channelId,
  visibility,
  initial,
  appUrl,
  save,
  sendTest,
}: {
  channelId: string;
  visibility: DiscordVisibility;
  initial: Partial<DiscordTemplate> | null;
  appUrl: string;
  save: (id: string, t: DiscordTemplate) => Promise<{ ok: boolean; error?: string }>;
  sendTest: (id: string, kind: NotifyKind, t: DiscordTemplate) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [t, setT] = useState<DiscordTemplate>(() => normalizeTemplate(initial, visibility));
  const [kind, setKind] = useState<NotifyKind>("down");
  const [raw, setRaw] = useState(Boolean(t.rawJson));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const payload = useMemo(() => buildDiscordPayload(t, visibility, kind, sampleContext(kind, appUrl)), [t, visibility, kind, appUrl]);
  const set = <K extends keyof DiscordTemplate>(k: K, v: DiscordTemplate[K]) => setT((prev) => ({ ...prev, [k]: v }));
  const titleKey = (kind === "test" ? "down" : kind) as keyof DiscordTemplate["titles"];

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader title="Identity" description={visibility === "public" ? "Community-facing embeds, kept minimal" : "Internal ops embeds with full diagnostics"} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Webhook username">
              <Input value={t.username} onChange={(e) => set("username", e.target.value)} />
            </Field>
            <Field label="Avatar URL">
              <Input value={t.avatarUrl} onChange={(e) => set("avatarUrl", e.target.value)} placeholder="https://…/logo.png" />
            </Field>
            {visibility === "private" && (
              <Field label="Mention" hint="<@&ROLE_ID> or <@USER_ID>; the current on-call responder is added automatically">
                <Input value={t.mention} onChange={(e) => set("mention", e.target.value)} placeholder="<@&123456789012345678>" className="font-mono" />
              </Field>
            )}
            <Field label="Message content" hint="Plain text above the embed">
              <Input value={t.content} onChange={(e) => set("content", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Embed" description="Titles and colours per event. Pick an event on the right to preview it." />
          <div className="space-y-4 p-5">
            <Field label={`Title: ${EVENTS.find((e) => e.value === kind)?.label}`}>
              <Input value={t.titles[titleKey]} onChange={(e) => set("titles", { ...t.titles, [titleKey]: e.target.value })} className="font-mono text-[13px]" />
            </Field>
            <div className="grid grid-cols-5 gap-3">
              {(Object.keys(t.colors) as (keyof DiscordTemplate["colors"])[]).map((c) => (
                <label key={c} className="text-xs capitalize text-muted">
                  {c}
                  <input type="color" value={t.colors[c]} onChange={(e) => set("colors", { ...t.colors, [c]: e.target.value.toUpperCase() })} className="mt-1 block h-8 w-full cursor-pointer rounded border border-line-strong bg-bg" />
                </label>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(FIELD_LABELS) as (keyof DiscordTemplate["fields"])[])
                .filter((f) => visibility === "private" || !FIELD_LABELS[f].privateOnly)
                .map((f) => (
                  <Checkbox key={f} checked={t.fields[f]} onChange={(e) => set("fields", { ...t.fields, [f]: e.target.checked })} label={FIELD_LABELS[f].label} />
                ))}
            </div>
            <Field label="Footer">
              <Input value={t.footer} onChange={(e) => set("footer", e.target.value)} className="font-mono text-[13px]" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Buttons" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Checkbox checked={t.buttons.view} onChange={(e) => set("buttons", { ...t.buttons, view: e.target.checked })} label="View incident button" />
              <Input value={t.buttons.viewLabel} onChange={(e) => set("buttons", { ...t.buttons, viewLabel: e.target.value })} />
            </div>
            {visibility === "private" && (
              <div className="space-y-2">
                <Checkbox checked={t.buttons.ack} onChange={(e) => set("buttons", { ...t.buttons, ack: e.target.checked })} label="Acknowledge button (signed link)" />
                <Input value={t.buttons.ackLabel} onChange={(e) => set("buttons", { ...t.buttons, ackLabel: e.target.value })} />
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Raw JSON template"
            description="Full control: replaces the generated payload. All {{variables}} are rendered."
            actions={<Checkbox checked={raw} onChange={(e) => { setRaw(e.target.checked); if (!e.target.checked) set("rawJson", ""); else if (!t.rawJson) set("rawJson", JSON.stringify(buildDiscordPayload({ ...t, rawJson: "" }, visibility, "down", { ...sampleContext("down", appUrl) }), null, 2)); }} label="Enable" />}
          />
          {raw && (
            <div className="p-5">
              <Textarea rows={14} value={t.rawJson} onChange={(e) => set("rawJson", e.target.value)} />
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 border-t border-line p-5">
            {TEMPLATE_VARIABLES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => navigator.clipboard?.writeText(`{{${v}}}`)}
                title="Copy"
                className="cursor-pointer rounded border border-line-strong bg-bg px-1.5 py-0.5 font-mono text-[11px] text-muted hover:text-fg"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Select value={kind} onChange={(e) => setKind(e.target.value as NotifyKind)} className="w-auto">
            {EVENTS.map((e) => (
              <option key={e.value} value={e.value}>
                Preview: {e.label}
              </option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await sendTest(channelId, kind, t);
                  setMsg({ ok: r.ok, text: r.ok ? "Test payload sent to Discord" : r.error || "Failed" });
                })
              }
            >
              Send test payload
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await save(channelId, t);
                  setMsg({ ok: r.ok, text: r.ok ? "Template saved" : r.error || "Failed" });
                })
              }
            >
              Save template
            </Button>
          </div>
        </div>
        {msg && <div className={`rounded-lg border px-3 py-2 text-sm ${msg.ok ? "border-up/30 bg-up/10 text-up" : "border-down/30 bg-down/10 text-down"}`}>{msg.text}</div>}
        <DiscordPreview payload={payload} />
        <details className="rounded-lg border border-line bg-card">
          <summary className="cursor-pointer px-4 py-2.5 text-sm text-muted">Payload JSON</summary>
          <pre className="max-h-96 overflow-auto px-4 pb-4 font-mono text-xs text-muted sr-scroll">{JSON.stringify(payload, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
}
