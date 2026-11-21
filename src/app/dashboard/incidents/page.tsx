import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import { Card, CardHeader, Empty, LinkButton, PageHeader, Pill, Stat, Table } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayKey, fmtDate, formatDuration } from "@/lib/format";
import { mttStats } from "@/lib/incidents";
import { incidentLabel } from "@/lib/urls";
import { IncidentTabs } from "./tabs";

export const metadata = { title: "Incidents" };

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [incidents, last30] = await Promise.all([
    db.incident.findMany({
      where: { workspaceId: ctx.workspace.id, ...(sp.filter === "open" ? { resolvedAt: null } : {}) },
      include: { monitors: { include: { monitor: { select: { name: true } } } } },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
    db.incident.findMany({ where: { workspaceId: ctx.workspace.id, startedAt: { gte: since }, severity: { not: "maintenance" } } }),
  ]);
  const stats = mttStats(last30);

  // MTTR trend: average resolve time per week (last 4 weeks).
  const weeks = [3, 2, 1, 0].map((w) => {
    const from = Date.now() - (w + 1) * 7 * 86_400_000;
    const to = Date.now() - w * 7 * 86_400_000;
    const inWeek = last30.filter((i) => i.startedAt.getTime() >= from && i.startedAt.getTime() < to);
    const s = mttStats(inWeek);
    return { label: dayKey(new Date(from)).slice(5), mttr: s.mttr, mtta: s.mtta, count: inWeek.length };
  });
  const maxW = Math.max(...weeks.map((w) => w.mttr ?? 0), 1);
  const open = incidents.filter((i) => !i.resolvedAt).length;

  return (
    <>
      <PageHeader
        title="Incidents"
        description="Automatically created on confirmed failures and resolved on recovery, or declared manually."
        actions={
          <LinkButton href="/dashboard/incidents/new" variant="primary">
            <Plus size={16} /> Declare incident
          </LinkButton>
        }
      />
      <IncidentTabs active="incidents" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open incidents" value={open} tone={open ? "down" : "up"} />
        <Stat label="Incidents (30d)" value={stats.count} />
        <Stat label="MTTA (30d)" value={stats.mtta != null ? formatDuration(stats.mtta) : "—"} sub="Mean time to acknowledge" />
        <Stat label="MTTR (30d)" value={stats.mttr != null ? formatDuration(stats.mttr) : "—"} sub="Mean time to resolve" />
      </div>

      <Card className="mt-6">
        <CardHeader title="Resolution trend" description="Mean time to resolve, per week" />
        <div className="flex h-36 items-end gap-6 px-6 pb-4 pt-6">
          {weeks.map((w) => (
            <div key={w.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="text-xs tabular-nums text-muted">{w.mttr != null ? formatDuration(w.mttr) : "—"}</div>
              <div className="w-full max-w-16 rounded-t bg-up/70" style={{ height: `${Math.max(((w.mttr ?? 0) / maxW) * 70, w.mttr ? 4 : 1)}px` }} />
              <div className="text-xs text-dim">
                wk of {w.label} · {w.count}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-3 mt-8 flex gap-3 text-sm">
        <Link href="/dashboard/incidents" className={sp.filter !== "open" ? "text-fg" : "text-muted"}>
          All
        </Link>
        <Link href="/dashboard/incidents?filter=open" className={sp.filter === "open" ? "text-fg" : "text-muted"}>
          Open
        </Link>
      </div>
      {incidents.length === 0 ? (
        <Empty icon={<AlertTriangle size={28} />} title="No incidents" description="Nice. Nothing has gone wrong yet." />
      ) : (
        <Card>
          <Table head={["Incident", "Status", "Severity", "Affected", "Started", "Duration"]}>
            {incidents.map((i) => (
              <tr key={i.id} className="hover:bg-fg/[0.02]">
                <td className="px-5 py-3">
                  <Link href={`/dashboard/incidents/${i.id}`} className="font-medium hover:underline">
                    <span className="mr-1.5 font-mono text-xs text-dim">#{incidentLabel(ctx.workspace.incidentPrefix, i.number)}</span>
                    {i.title}
                  </Link>
                  {!i.acknowledgedAt && !i.resolvedAt && <span className="ml-2 text-xs text-warn">unacknowledged</span>}
                </td>
                <td className="px-5 py-3">
                  <Pill status={i.status} />
                </td>
                <td className="px-5 py-3">
                  <Pill status={i.severity} />
                </td>
                <td className="max-w-[200px] truncate px-5 py-3 text-muted">{i.monitors.map((m) => m.monitor.name).join(", ") || "—"}</td>
                <td className="whitespace-nowrap px-5 py-3 text-muted">{fmtDate(i.startedAt)}</td>
                <td className="px-5 py-3 text-muted">{formatDuration((i.resolvedAt?.getTime() ?? Date.now()) - i.startedAt.getTime())}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}
