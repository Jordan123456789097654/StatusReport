import { Button, Card, CardHeader, Checkbox, Field, Flash, Input, PageHeader, Pill, Table, Textarea } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db, json } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { createMaintenance, deleteMaintenance } from "../../actions/incidents";
import { IncidentTabs } from "../tabs";

export const metadata = { title: "Maintenance" };

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const [windows, monitors] = await Promise.all([
    db.maintenance.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { startsAt: "desc" }, take: 50 }),
    db.monitor.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const names = new Map(monitors.map((m) => [m.id, m.name]));
  return (
    <>
      <PageHeader title="Incidents" description="Schedule maintenance windows with automatic status page banners and optional alert muting." />
      <IncidentTabs active="maintenance" />
      <Flash error={sp.error} ok={sp.ok} />
      <Card className="mb-6">
        <CardHeader title="Schedule maintenance" />
        <form action={createMaintenance} className="grid gap-5 p-5 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <Input name="title" required placeholder="Database upgrade" />
          </Field>
          <Field label="Starts (UTC)">
            <Input name="startsAt" type="datetime-local" required />
          </Field>
          <Field label="Ends (UTC)">
            <Input name="endsAt" type="datetime-local" required />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea name="description" rows={3} placeholder="We'll be upgrading our primary database. Expect brief read-only periods." />
          </Field>
          {monitors.length > 0 && (
            <Field label="Affected components" className="sm:col-span-2">
              <div className="grid max-h-40 gap-2 overflow-y-auto rounded-lg border border-line-strong bg-bg p-3 sm:grid-cols-3">
                {monitors.map((m) => (
                  <Checkbox key={m.id} name="monitorIds" value={m.id} label={m.name} />
                ))}
              </div>
            </Field>
          )}
          <div className="flex items-center justify-between sm:col-span-2">
            <Checkbox name="muteAlerts" defaultChecked label="Mute alerts for affected monitors during the window" />
            <Button variant="primary">Schedule</Button>
          </div>
        </form>
      </Card>
      <Card>
        <Table head={["Window", "Status", "Starts", "Ends", "Components", ""]}>
          {windows.map((w) => (
            <tr key={w.id}>
              <td className="px-5 py-3 font-medium">{w.title}</td>
              <td className="px-5 py-3">
                <Pill status={w.status} />
              </td>
              <td className="px-5 py-3 text-muted">{fmtDate(w.startsAt)}</td>
              <td className="px-5 py-3 text-muted">{fmtDate(w.endsAt)}</td>
              <td className="max-w-[220px] truncate px-5 py-3 text-muted">
                {json<string[]>(w.monitorIds, []).map((id) => names.get(id)).filter(Boolean).join(", ") || "All"}
              </td>
              <td className="px-5 py-3 text-right">
                <form action={deleteMaintenance}>
                  <input type="hidden" name="id" value={w.id} />
                  <Button variant="ghost" className="text-xs">
                    Delete
                  </Button>
                </form>
              </td>
            </tr>
          ))}
          {!windows.length && (
            <tr>
              <td colSpan={6} className="px-5 py-6 text-center text-muted">
                No maintenance scheduled
              </td>
            </tr>
          )}
        </Table>
      </Card>
    </>
  );
}
