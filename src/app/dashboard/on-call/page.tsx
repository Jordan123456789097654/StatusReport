import { Phone } from "lucide-react";
import { Button, Card, CardHeader, Field, Flash, Input, PageHeader, Select, Table } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db, json } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { currentOnCallId, type EscalationStep } from "@/lib/oncall";
import { deletePolicy, deleteSchedule, savePolicy, saveSchedule } from "../actions/oncall";

export const metadata = { title: "On-call" };
export const dynamic = "force-dynamic";

export default async function OnCallPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const [schedules, policies, channels, members] = await Promise.all([
    db.onCallSchedule.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } }),
    db.escalationPolicy.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } }),
    db.alertChannel.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { name: "asc" } }),
    db.membership.findMany({ where: { workspaceId: ctx.workspace.id }, include: { user: true } }),
  ]);
  const userName = (id: string) => {
    const m = members.find((x) => x.userId === id);
    return m ? m.user.name || m.user.email : "unknown";
  };
  const canEdit = ctx.role === "owner" || ctx.role === "admin";

  return (
    <>
      <PageHeader title="On-call" description="Rotation schedules and multi-tier escalation. Escalation stops once an incident is acknowledged." />
      <Flash error={sp.error} ok={sp.ok} />

      {canEdit && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Rotation schedule" description="Responders are paged in order, one per rotation period" />
            <form action={saveSchedule} className="space-y-4 p-5">
              <Field label="Name">
                <Input name="name" required placeholder="Primary on-call" />
              </Field>
              <Field label="Rotation length (hours)">
                <Input name="rotationHours" type="number" min={1} defaultValue={168} />
              </Field>
              <Field label="Starts (UTC)" hint="Leave empty to start now">
                <Input name="startsAt" type="datetime-local" />
              </Field>
              <Field label="Responders, in rotation order" hint="Comma separated user IDs in order, or tick names below">
                <div className="space-y-2 rounded-lg border border-line-strong bg-bg p-3">
                  {members.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="memberIds" value={m.userId} /> {m.user.name || m.user.email}
                    </label>
                  ))}
                </div>
              </Field>
              <input type="hidden" name="memberOrder" value="" />
              <Button variant="primary">Create schedule</Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Escalation policy" description="Each step notifies its channels after a delay" />
            <form action={savePolicy} className="space-y-4 p-5">
              <Field label="Policy name">
                <Input name="name" required placeholder="Critical API" />
              </Field>
              {[0, 1, 2].map((i) => (
                <div key={i} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[110px_1fr]">
                  <Field label={`Step ${i + 1} delay (min)`}>
                    <Input name={`step${i}_delay`} type="number" min={0} defaultValue={i === 0 ? 0 : i * 10} disabled={i === 0} />
                  </Field>
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted">Channels</div>
                    <div className="flex flex-wrap gap-3">
                      {channels.map((c) => (
                        <label key={c.id} className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" name={`step${i}_channels`} value={c.id} /> {c.name}
                        </label>
                      ))}
                    </div>
                    <Select name={`step${i}_schedule`} className="text-sm">
                      <option value="">Page no one specific</option>
                      {schedules.map((s) => (
                        <option key={s.id} value={s.id}>
                          Page on call: {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              ))}
              <Button variant="primary">Create policy</Button>
            </form>
          </Card>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Schedules" />
          {schedules.length ? (
            <Table head={["Name", "Now on call", "Rotation", ""]}>
              {schedules.map((s) => {
                const uid = currentOnCallId(s);
                return (
                  <tr key={s.id}>
                    <td className="px-5 py-3 font-medium">{s.name}</td>
                    <td className="px-5 py-3 text-up">{uid ? userName(uid) : "—"}</td>
                    <td className="px-5 py-3 text-muted">every {s.rotationHours}h · {json<string[]>(s.memberIds, []).length} people</td>
                    <td className="px-5 py-3 text-right">
                      {canEdit && (
                        <form action={deleteSchedule}>
                          <input type="hidden" name="id" value={s.id} />
                          <Button variant="ghost" className="text-xs">
                            Delete
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <p className="flex items-center gap-2 p-5 text-sm text-muted">
              <Phone size={15} /> No schedules yet.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="Policies" />
          {policies.length ? (
            <ul className="divide-y divide-line text-sm">
              {policies.map((p) => {
                const steps = json<EscalationStep[]>(p.steps, []);
                return (
                  <li key={p.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="mt-1 text-xs text-muted">
                        {steps.map((s, i) => `${i + 1}. +${s.delayMin}m → ${s.channelIds.length} channel(s)`).join(" · ")}
                      </div>
                      <div className="text-xs text-dim">created {fmtDate(p.createdAt)}</div>
                    </div>
                    {canEdit && (
                      <form action={deletePolicy}>
                        <input type="hidden" name="id" value={p.id} />
                        <Button variant="ghost" className="text-xs">
                          Delete
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-5 text-sm text-muted">No escalation policies yet. Attach one to a monitor from its Configure page.</p>
          )}
        </Card>
      </div>
    </>
  );
}
