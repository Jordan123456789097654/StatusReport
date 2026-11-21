import { Button, Card, Checkbox, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { INCIDENT_STATUSES, SEVERITIES } from "@/lib/incidents";
import { createIncident } from "../../actions/incidents";

export const metadata = { title: "Declare incident" };

export default async function NewIncident({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const ctx = await requireWorkspace("responder");
  const sp = await searchParams;
  const monitors = await db.monitor.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Declare an incident" back={{ href: "/dashboard/incidents", label: "Incidents" }} />
      <Flash error={sp.error} />
      <Card className="max-w-3xl p-6">
        <form action={createIncident} className="space-y-5">
          <Field label="Title">
            <Input name="title" required placeholder="Elevated API error rates" />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Status">
              <Select name="status" defaultValue="investigating">
                {INCIDENT_STATUSES.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Severity">
              <Select name="severity" defaultValue="major">
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Message" hint="Markdown supported: **bold**, `code`, lists, [links](https://…)">
            <Textarea name="message" rows={5} placeholder="We're investigating reports of…" />
          </Field>
          {monitors.length > 0 && (
            <Field label="Affected components">
              <div className="grid max-h-48 gap-2 overflow-y-auto rounded-lg border border-line-strong bg-bg p-3 sm:grid-cols-2">
                {monitors.map((m) => (
                  <Checkbox key={m.id} name="monitorIds" value={m.id} label={m.name} />
                ))}
              </div>
            </Field>
          )}
          <div className="flex flex-wrap gap-6">
            <Checkbox name="public" defaultChecked label="Show on status pages" />
            <Checkbox name="notify" defaultChecked label="Notify channels & subscribers" />
          </div>
          <Button variant="primary">Declare incident</Button>
        </form>
      </Card>
    </>
  );
}
