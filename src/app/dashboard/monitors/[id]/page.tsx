import Link from "next/link";
import { notFound } from "next/navigation";
import { Pause, Pencil, Play, RefreshCw } from "lucide-react";
import { LatencyChart, UptimeBars } from "@/components/charts";
import { CopyField } from "@/components/CopyButton";
import { Button, Card, CardHeader, LinkButton, PageHeader, Pill, Stat, StatusDot, Table } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration, fmtDate, pct, timeAgo, INTERVALS } from "@/lib/format";
import { protocolLabel } from "@/lib/monitoring/types";
import { latencySeries, recentBars, uptime24h, uptimeByMonitor } from "@/lib/stats";
import { heartbeatUrl, incidentLabel } from "@/lib/urls";
import { checkNow, togglePause } from "../../actions/monitors";

export const dynamic = "force-dynamic";

export default async function MonitorDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireWorkspace();
  const { id } = await params;
  const m = await db.monitor.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!m) notFound();

  const [u24, u7, u30, u90, series, bars, checks, incidents, deployments] = await Promise.all([
    uptime24h(m.id),
    uptimeByMonitor([m.id], 7),
    uptimeByMonitor([m.id], 30),
    uptimeByMonitor([m.id], 90),
    latencySeries(m.id, 24, m.intervalSec <= 60 ? 10 : 30),
    recentBars(m.id, 90),
    db.checkResult.findMany({ where: { monitorId: m.id }, orderBy: { createdAt: "desc" }, take: 25 }),
    db.incident.findMany({ where: { monitors: { some: { monitorId: m.id } } }, orderBy: { startedAt: "desc" }, take: 10 }),
    db.deployment.findMany({ where: { workspaceId: ctx.workspace.id, OR: [{ monitorId: m.id }, { monitorId: null }], createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
  ]);
  const last = checks[0];
  const state = m.paused ? "paused" : m.inMaintenance ? "maintenance" : m.status;
  const avgLatency = series.length ? Math.round(series.reduce((a, b) => a + b.v, 0) / series.length) : null;
  const isHttp = ["http", "keyword", "json"].includes(m.type);
  const waterfall = last && last.ok && isHttp ? [
    { label: "DNS lookup", v: last.dnsMs ?? 0, color: "#7C83FF" },
    { label: "TCP connection", v: last.tcpMs ?? 0, color: "#38BDF8" },
    { label: "TLS handshake", v: last.tlsMs ?? 0, color: "#F59E0B" },
    { label: "Time to first byte", v: last.ttfbMs ?? 0, color: "#22C55E" },
  ] : null;
  const total = waterfall ? waterfall.reduce((a, b) => a + b.v, 0) || 1 : 1;

  return (
    <>
      <PageHeader
        back={{ href: m.type === "heartbeat" ? "/dashboard/heartbeats" : "/dashboard/monitors", label: m.type === "heartbeat" ? "Heartbeats" : "Monitors" }}
        title={
          <span className="flex items-center gap-3">
            <StatusDot status={state} className="h-3 w-3" />
            {m.name}
          </span>
        }
        description={
          <span className="font-mono text-xs">
            {protocolLabel(m)} {isHttp ? m.method : ""} {m.target || "heartbeat"} · checked every {INTERVALS.find((i) => i.value === m.intervalSec)?.label ?? formatDuration(m.intervalSec * 1000)}
            {m.type !== "heartbeat" ? ` from ${m.regions}` : ""}
          </span>
        }
        actions={
          <>
            {m.type !== "heartbeat" && !m.paused && (
              <form action={checkNow}>
                <input type="hidden" name="id" value={m.id} />
                <Button>
                  <RefreshCw size={15} /> Check now
                </Button>
              </form>
            )}
            <form action={togglePause}>
              <input type="hidden" name="id" value={m.id} />
              <Button>{m.paused ? <><Play size={15} /> Resume</> : <><Pause size={15} /> Pause</>}</Button>
            </form>
            <LinkButton href={`/dashboard/monitors/${m.id}/edit`}>
              <Pencil size={15} /> Configure
            </LinkButton>
          </>
        }
      />

      {m.type === "heartbeat" && m.heartbeatToken && (
        <Card className="mb-6 p-5">
          <div className="mb-2 text-sm font-medium">Check-in URL</div>
          <CopyField value={heartbeatUrl(m.heartbeatToken)} />
          <p className="mt-2 text-xs text-dim">
            Add <code className="font-mono">curl -fsS --retry 3 {heartbeatUrl(m.heartbeatToken)}</code> to the end of your cron job. Append{" "}
            <code className="font-mono">?status=fail</code> to report a failure explicitly. Last check-in: {timeAgo(m.lastHeartbeatAt)}.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={state === "down" ? "Currently down for" : state === "paused" ? "Status" : "Currently up for"}
          value={state === "paused" ? "Paused" : m.lastStatusChange ? formatDuration(Date.now() - m.lastStatusChange.getTime()) : "—"}
          tone={state === "down" ? "down" : state === "up" ? "up" : undefined}
        />
        <Stat label="Last checked" value={timeAgo(m.lastCheckedAt)} sub={last?.region ? `from ${last.region}` : undefined} />
        <Stat label="Avg. response (24h)" value={avgLatency != null ? `${avgLatency} ms` : "—"} />
        <Stat label="Incidents" value={incidents.length} sub={incidents[0] ? `last ${timeAgo(incidents[0].startedAt)}` : "none recorded"} />
      </div>

      <Card className="mt-6">
        <div className="grid divide-y divide-line sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          {[
            ["Last 24 hours", u24],
            ["Last 7 days", u7.get(m.id)],
            ["Last 30 days", u30.get(m.id)],
            ["Last 90 days", u90.get(m.id)],
          ].map(([label, v]) => (
            <div key={String(label)} className="px-5 py-4">
              <div className="text-xs text-dim">{label as string}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{pct(v as number | null, 3)}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-5 py-4">
          <UptimeBars bars={bars} config={{ height: 30, gap: 2, radius: 2, tooltip: "{date} · {uptime}" }} />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Response time" description="Last 24 hours. Dashed lines mark deployments." />
          <div className="p-5">
            <LatencyChart points={series} deployments={deployments.map((d) => ({ t: d.createdAt.getTime(), label: d.version }))} height={180} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Latest request breakdown" description={last ? `${fmtDate(last.createdAt)}` : undefined} />
          <div className="space-y-3 p-5">
            {waterfall ? (
              <>
                {waterfall.map((w, i) => {
                  const offset = waterfall.slice(0, i).reduce((a, b) => a + b.v, 0);
                  return (
                    <div key={w.label}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted">{w.label}</span>
                        <span className="font-mono tabular-nums">{w.v} ms</span>
                      </div>
                      <div className="relative h-2 rounded bg-fg/5">
                        <div className="absolute h-2 rounded" style={{ left: `${(offset / total) * 100}%`, width: `${Math.max((w.v / total) * 100, 1)}%`, background: w.color }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex justify-between border-t border-line pt-3 text-sm">
                  <span>Total</span>
                  <span className="font-mono font-semibold">{last!.latencyMs} ms</span>
                </div>
                {last?.resolvedIp && <div className="text-xs text-dim">Resolved IP {last.resolvedIp}</div>}
              </>
            ) : (
              <p className="text-sm text-muted">{last ? (last.ok ? `${last.latencyMs ?? "—"} ms` : last.error) : "No checks yet."}</p>
            )}
            {(m.sslExpiresAt || m.domainExpiresAt) && (
              <div className="space-y-1 border-t border-line pt-3 text-xs text-muted">
                {m.sslExpiresAt && (
                  <div>
                    SSL expires {fmtDate(m.sslExpiresAt)} ({Math.floor((m.sslExpiresAt.getTime() - Date.now()) / 86_400_000)} days){m.sslIssuer ? ` · ${m.sslIssuer}` : ""}
                  </div>
                )}
                {m.domainExpiresAt && <div>Domain expires {fmtDate(m.domainExpiresAt)} ({Math.floor((m.domainExpiresAt.getTime() - Date.now()) / 86_400_000)} days)</div>}
              </div>
            )}
          </div>
        </Card>
      </div>

      {incidents.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Incidents" />
          <Table head={["Incident", "Status", "Started", "Duration"]}>
            {incidents.map((i) => (
              <tr key={i.id}>
                <td className="px-5 py-3">
                  <Link href={`/dashboard/incidents/${i.id}`} className="hover:underline">
                    <span className="text-dim">#{incidentLabel(ctx.workspace.incidentPrefix, i.number)}</span> {i.title}
                  </Link>
                </td>
                <td className="px-5 py-3">
                  <Pill status={i.status} />
                </td>
                <td className="px-5 py-3 text-muted">{fmtDate(i.startedAt)}</td>
                <td className="px-5 py-3 text-muted">{formatDuration((i.resolvedAt?.getTime() ?? Date.now()) - i.startedAt.getTime())}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Recent checks" />
        <Table head={["Time", "Region", "Result", "Code", "Latency", "Details"]}>
          {checks.map((c) => (
            <tr key={c.id}>
              <td className="whitespace-nowrap px-5 py-2.5 text-muted">{fmtDate(c.createdAt)}</td>
              <td className="px-5 py-2.5 font-mono text-xs">{c.region}</td>
              <td className="px-5 py-2.5">
                <span className="inline-flex items-center gap-2">
                  <StatusDot status={c.status} pulse={false} /> {c.status}
                </span>
              </td>
              <td className="px-5 py-2.5 font-mono text-xs">{c.statusCode ?? "—"}</td>
              <td className="px-5 py-2.5 font-mono text-xs tabular-nums">{c.latencyMs != null ? `${c.latencyMs} ms` : "—"}</td>
              <td className="max-w-sm truncate px-5 py-2.5 text-xs text-muted" title={c.error ?? c.snippet ?? ""}>
                {c.error ?? (c.snippet ? c.snippet.slice(0, 80) : "")}
              </td>
            </tr>
          ))}
          {!checks.length && (
            <tr>
              <td colSpan={6} className="px-5 py-6 text-center text-sm text-muted">
                No checks yet. Make sure the worker is running (<code className="font-mono">npm run worker</code>).
              </td>
            </tr>
          )}
        </Table>
      </Card>
    </>
  );
}
