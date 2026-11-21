import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { PostmortemEditor } from "@/components/PostmortemEditor";
import { Button, Card, CardHeader, Checkbox, Field, Flash, Input, PageHeader, Pill, Select, Textarea } from "@/components/ui";
import { can, requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, formatDuration } from "@/lib/format";
import { INCIDENT_STATUSES, SEVERITIES } from "@/lib/incidents";
import { renderMarkdown } from "@/lib/markdown";
import { incidentLabel } from "@/lib/urls";
import { ackIncident, deleteIncident, postUpdate, savePostmortem, updateIncidentMeta } from "../../actions/incidents";

export const dynamic = "force-dynamic";

export default async function IncidentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const ctx = await requireWorkspace();
  const { id } = await params;
  const sp = await searchParams;
  const i = await db.incident.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { updates: { orderBy: { createdAt: "desc" } }, monitors: { include: { monitor: true } } },
  });
  if (!i) notFound();
  const authors = await db.user.findMany({ where: { id: { in: i.updates.map((u) => u.authorId).filter((x): x is string => Boolean(x)) } } });
  const authorName = (aid: string | null) => (aid ? authors.find((a) => a.id === aid)?.name || authors.find((a) => a.id === aid)?.email : "StatusReport");
  const logs = await db.notificationLog.findMany({ where: { incidentId: i.id }, orderBy: { createdAt: "desc" }, take: 20 });
  const channels = await db.alertChannel.findMany({ where: { id: { in: logs.map((l) => l.channelId).filter((x): x is string => Boolean(x)) } } });
  const responder = can(ctx.role, "responder");

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/incidents", label: "Incidents" }}
        title={
          <span>
            <span className="mr-2 font-mono text-lg text-dim">#{incidentLabel(ctx.workspace.incidentPrefix, i.number)}</span>
            {i.title}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Pill status={i.status} /> <Pill status={i.severity} />
            {i.auto && <span className="text-xs text-dim">auto-detected</span>}
            <span className="text-xs text-dim">
              started {fmtDate(i.startedAt)} · {i.resolvedAt ? `resolved after ${formatDuration(i.resolvedAt.getTime() - i.startedAt.getTime())}` : `ongoing for ${formatDuration(Date.now() - i.startedAt.getTime())}`}
            </span>
          </span>
        }
        actions={
          responder && !i.acknowledgedAt && !i.resolvedAt ? (
            <form action={ackIncident}>
              <input type="hidden" name="id" value={i.id} />
              <Button variant="primary">
                <CheckCircle2 size={15} /> Acknowledge
              </Button>
            </form>
          ) : i.acknowledgedAt ? (
            <span className="text-sm text-muted">
              Acknowledged by {i.acknowledgedBy} · {formatDuration(i.acknowledgedAt.getTime() - i.startedAt.getTime())} after start
            </span>
          ) : null
        }
      />
      <Flash error={sp.error} ok={sp.ok} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {responder && (
            <Card>
              <CardHeader title="Post an update" description="Updates appear on the status page timeline and go to subscribers." />
              <form action={postUpdate} className="space-y-4 p-5">
                <input type="hidden" name="id" value={i.id} />
                <div className="flex flex-wrap gap-2">
                  {INCIDENT_STATUSES.map((s) => (
                    <label key={s} className="cursor-pointer">
                      <input type="radio" name="status" value={s} defaultChecked={s === (i.status === "resolved" ? "resolved" : i.status)} className="peer sr-only" />
                      <span className="inline-block rounded-lg border border-line-strong px-3 py-1.5 text-sm capitalize text-muted peer-checked:border-up/60 peer-checked:bg-up/10 peer-checked:text-fg">
                        {s}
                      </span>
                    </label>
                  ))}
                </div>
                <Textarea name="message" rows={4} required placeholder="We've identified the cause and are deploying a fix. **Markdown** supported." />
                <div className="flex items-center justify-between">
                  <Checkbox name="notify" defaultChecked label="Notify channels & subscribers" />
                  <Button variant="primary">Post update</Button>
                </div>
              </form>
            </Card>
          )}

          <Card>
            <CardHeader title="Timeline" />
            <ol className="relative ml-8 border-l border-line py-5 pr-5">
              {i.updates.map((u, idx) => (
                <li key={u.id} className="relative mb-6 pl-6 last:mb-0">
                  <span className={`absolute -left-[6px] top-1 h-3 w-3 rounded-full border-2 border-card ${u.status === "resolved" ? "bg-up" : idx === 0 ? "bg-down" : "bg-dim"}`} />
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold capitalize">{u.status}</span>
                    <span className="text-xs text-dim">
                      {fmtDate(u.createdAt)} · {authorName(u.authorId)}
                    </span>
                  </div>
                  <div className="prose-sr mt-1 text-sm text-fg/90" dangerouslySetInnerHTML={{ __html: renderMarkdown(u.message) }} />
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHeader title="Post-mortem" description="Structured root-cause analysis, publishable to the status page." />
            <PostmortemEditor id={i.id} initial={i.postmortem || ""} published={i.postmortemPublished} action={savePostmortem} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <form action={updateIncidentMeta} className="space-y-4 p-5">
              <input type="hidden" name="id" value={i.id} />
              <Field label="Title">
                <Input name="title" defaultValue={i.title} />
              </Field>
              <Field label="Severity">
                <Select name="severity" defaultValue={i.severity}>
                  {SEVERITIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Checkbox name="public" defaultChecked={i.public} label="Visible on status pages" />
              {responder && <Button className="w-full">Save</Button>}
            </form>
          </Card>

          <Card>
            <CardHeader title="Affected monitors" />
            <ul className="divide-y divide-line">
              {i.monitors.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <Link href={`/dashboard/monitors/${m.monitorId}`} className="hover:underline">
                    {m.monitor.name}
                  </Link>
                  <span className={m.resolvedAt ? "text-up" : "text-down"}>{m.resolvedAt ? "recovered" : "affected"}</span>
                </li>
              ))}
              {!i.monitors.length && <li className="px-5 py-3 text-sm text-muted">None linked</li>}
            </ul>
            {i.cause && <div className="border-t border-line px-5 py-3 font-mono text-xs text-down">{i.cause}</div>}
          </Card>

          <Card>
            <CardHeader title="Notifications sent" />
            <ul className="divide-y divide-line text-sm">
              {logs.map((l) => (
                <li key={l.id} className="px-5 py-2.5">
                  <div className="flex justify-between">
                    <span>{channels.find((c) => c.id === l.channelId)?.name ?? "channel"}</span>
                    <span className={l.ok ? "text-up" : "text-down"}>{l.ok ? "sent" : "failed"}</span>
                  </div>
                  <div className="text-xs text-dim">
                    {l.kind} · {fmtDate(l.createdAt)}
                    {l.error ? ` · ${l.error}` : ""}
                  </div>
                </li>
              ))}
              {!logs.length && <li className="px-5 py-3 text-muted">No notifications yet</li>}
            </ul>
          </Card>

          {can(ctx.role, "admin") && (
            <form action={deleteIncident}>
              <input type="hidden" name="id" value={i.id} />
              <Button variant="danger" className="w-full">
                Delete incident
              </Button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
