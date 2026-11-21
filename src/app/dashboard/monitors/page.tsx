import Link from "next/link";
import { Activity, Plus } from "lucide-react";
import { Card, Empty, LinkButton, PageHeader, StatusDot, Table } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { pct, timeAgo, INTERVALS, formatDuration } from "@/lib/format";
import { protocolLabel } from "@/lib/monitoring/types";
import { uptimeByMonitor } from "@/lib/stats";

export const metadata = { title: "Monitors" };

export default async function MonitorsPage() {
  const ctx = await requireWorkspace();
  const monitors = await db.monitor.findMany({ where: { workspaceId: ctx.workspace.id, type: { not: "heartbeat" } }, orderBy: [{ status: "asc" }, { name: "asc" }] });
  const uptime = await uptimeByMonitor(monitors.map((m) => m.id), 30);
  const down = monitors.filter((m) => m.status === "down").length;

  return (
    <>
      <PageHeader
        title="Monitors"
        description={monitors.length ? `${monitors.length} monitors · ${down ? `${down} down` : "all up"}` : "HTTP(S), keyword, JSON, TCP/UDP, ping, DNS, SSL and domain checks"}
        actions={
          <LinkButton href="/dashboard/monitors/new" variant="primary">
            <Plus size={16} /> Create monitor
          </LinkButton>
        }
      />
      {monitors.length === 0 ? (
        <Empty
          icon={<Activity size={28} />}
          title="No monitors yet"
          description="Create your first monitor and we'll check it as often as every 10 seconds, from as many regions as you run workers in."
          action={
            <LinkButton href="/dashboard/monitors/new" variant="primary">
              Create monitor
            </LinkButton>
          }
        />
      ) : (
        <Card>
          <Table head={["", "Monitor", "Uptime (30d)", "Interval", "Last check", "State"]}>
            {monitors.map((m) => (
              <tr key={m.id} className="hover:bg-white/[0.02]">
                <td className="w-8 py-3.5 pl-5">
                  <StatusDot status={m.paused ? "paused" : m.inMaintenance ? "maintenance" : m.status} />
                </td>
                <td className="px-5 py-3.5">
                  <Link href={`/dashboard/monitors/${m.id}`} className="font-medium hover:underline">
                    {m.name}
                  </Link>
                  <div className="mt-0.5 max-w-md truncate font-mono text-xs text-dim">
                    {protocolLabel(m)} {["http", "keyword", "json"].includes(m.type) ? m.method : ""} {m.target}
                  </div>
                </td>
                <td className="px-5 py-3.5 tabular-nums">{pct(uptime.get(m.id), 2)}</td>
                <td className="px-5 py-3.5 text-muted">{INTERVALS.find((i) => i.value === m.intervalSec)?.label ?? `${m.intervalSec}s`}</td>
                <td className="px-5 py-3.5 text-muted">{timeAgo(m.lastCheckedAt)}</td>
                <td className="px-5 py-3.5 text-sm">
                  {m.paused ? (
                    <span className="text-dim">Paused</span>
                  ) : m.status === "down" ? (
                    <span className="text-down">Down {m.lastStatusChange ? `for ${formatDuration(Date.now() - m.lastStatusChange.getTime())}` : ""}</span>
                  ) : m.status === "up" || m.status === "degraded" ? (
                    <span className={m.status === "up" ? "text-up" : "text-warn"}>
                      {m.status === "up" ? "Up" : "Degraded"} {m.lastStatusChange ? `for ${formatDuration(Date.now() - m.lastStatusChange.getTime())}` : ""}
                    </span>
                  ) : (
                    <span className="text-dim">Pending first check</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
