import Link from "next/link";
import { HeartPulse } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { Button, Card, CardHeader, Empty, Field, Input, PageHeader, Select, StatusDot, Table } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDuration, timeAgo } from "@/lib/format";
import { heartbeatUrl } from "@/lib/urls";
import { saveMonitor } from "../actions/monitors";

export const metadata = { title: "Heartbeats" };

export default async function HeartbeatsPage() {
  const ctx = await requireWorkspace();
  const beats = await db.monitor.findMany({ where: { workspaceId: ctx.workspace.id, type: "heartbeat" }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Heartbeats" description="Cron jobs, backups and queues ping a unique URL. We alert you when a check-in is missed." />
      <Card className="mb-6">
        <CardHeader title="New heartbeat" />
        <form action={saveMonitor} className="grid items-end gap-4 p-5 sm:grid-cols-4">
          <input type="hidden" name="type" value="heartbeat" />
          <Field label="Name">
            <Input name="name" required placeholder="Nightly database backup" />
          </Field>
          <Field label="Expected every">
            <Select name="intervalSec" defaultValue={86400}>
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
              <option value={3600}>1 hour</option>
              <option value={21600}>6 hours</option>
              <option value={86400}>1 day</option>
              <option value={604800}>1 week</option>
            </Select>
          </Field>
          <Field label="Grace period">
            <Select name="heartbeatGraceSec" defaultValue={900}>
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
              <option value={900}>15 minutes</option>
              <option value={3600}>1 hour</option>
              <option value={21600}>6 hours</option>
            </Select>
          </Field>
          <Button variant="primary">Create heartbeat</Button>
        </form>
      </Card>
      {beats.length === 0 ? (
        <Empty icon={<HeartPulse size={28} />} title="No heartbeats yet" description="Create one above, then add a curl call to the end of your job." />
      ) : (
        <Card>
          <Table head={["", "Heartbeat", "Expected", "Last check-in", "Check-in URL"]}>
            {beats.map((b) => (
              <tr key={b.id}>
                <td className="w-8 py-3.5 pl-5">
                  <StatusDot status={b.paused ? "paused" : b.status} />
                </td>
                <td className="px-5 py-3.5">
                  <Link href={`/dashboard/monitors/${b.id}`} className="font-medium hover:underline">
                    {b.name}
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-muted">
                  every {formatDuration(b.intervalSec * 1000)} <span className="text-dim">+{formatDuration(b.heartbeatGraceSec * 1000)} grace</span>
                </td>
                <td className="px-5 py-3.5 text-muted">{timeAgo(b.lastHeartbeatAt)}</td>
                <td className="px-5 py-3.5">
                  {b.heartbeatToken && (
                    <span className="flex items-center gap-2">
                      <code className="max-w-[260px] truncate font-mono text-xs text-dim">{heartbeatUrl(b.heartbeatToken)}</code>
                      <CopyButton value={heartbeatUrl(b.heartbeatToken)} />
                    </span>
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
