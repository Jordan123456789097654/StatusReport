import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { formatDuration } from "@/lib/format";

/** Shown on the dashboard when no check worker has reported in recently. */
export async function WorkerStatus() {
  const beats = await db.jobState.findMany({ where: { key: { startsWith: "worker:" } } });
  const latest = beats.reduce<number>((a, b) => Math.max(a, b.lastRunAt.getTime()), 0);
  const age = Date.now() - latest;
  if (latest && age < 120_000) return null;
  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div>
        <div className="font-medium">{latest ? `No worker has checked in for ${formatDuration(age)}.` : "No worker has connected yet."}</div>
        <div className="mt-0.5 text-warn/80">
          Monitors aren&apos;t being checked and heartbeat deadlines aren&apos;t being evaluated. Start the worker with <code className="font-mono">npm run worker</code> on a machine that can reach the database.
        </div>
      </div>
    </div>
  );
}
