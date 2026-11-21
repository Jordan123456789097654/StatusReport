import { notFound } from "next/navigation";
import { MonitorForm } from "@/components/MonitorForm";
import { Button, Card, CardHeader, Flash, PageHeader } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteMonitor, saveMonitor } from "../../../actions/monitors";

export const metadata = { title: "Edit monitor" };

export default async function EditMonitor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireWorkspace("admin");
  const { id } = await params;
  const sp = await searchParams;
  const monitor = await db.monitor.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!monitor) notFound();
  const policies = await db.escalationPolicy.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title={`Edit ${monitor.name}`} back={{ href: `/dashboard/monitors/${id}`, label: monitor.name }} />
      <Flash error={sp.error} />
      <MonitorForm monitor={monitor} policies={policies} action={saveMonitor} />
      <Card className="mt-8 border-down/25">
        <CardHeader title="Delete monitor" description="Removes the monitor, its check history and its status page components. This cannot be undone." />
        <form action={deleteMonitor} className="p-5">
          <input type="hidden" name="id" value={monitor.id} />
          <Button variant="danger">Delete {monitor.name}</Button>
        </form>
      </Card>
    </>
  );
}
