import { Button, Card, CardHeader, Field, Flash, Input, PageHeader, Select, Table } from "@/components/ui";
import { ApiKeyForm, InviteForm, TwoFactorSetup } from "@/components/TeamForms";
import { ROLES, can, requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { fmtDate } from "@/lib/format";
import { otpauthUrl } from "@/lib/totp";
import { createApiKey, changeRole, deleteApiKey, disable2fa, enable2fa, importBackup, inviteMember, removeMember, revokeInvite, saveProfile, saveWorkspace, start2fa } from "../actions/team";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Team & audit logs" };
export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const admin = can(ctx.role, "admin");
  const [members, invites, keys, audit, me] = await Promise.all([
    db.membership.findMany({ where: { workspaceId: ctx.workspace.id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    admin ? db.invite.findMany({ where: { workspaceId: ctx.workspace.id, expiresAt: { gt: new Date() } } }) : Promise.resolve([]),
    admin ? db.apiKey.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
    db.auditLog.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, take: 80 }),
    db.user.findUniqueOrThrow({ where: { id: ctx.user.id } }),
  ]);
  const otp = me.totpSecret && !me.totpEnabled ? me.totpSecret : null;

  return (
    <>
      <PageHeader title="Team & audit logs" description="Members, roles, API keys, two-factor authentication and an immutable activity log." />
      <Flash error={sp.error} ok={sp.ok} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Members" description="Owner · Admin · Incident Responder · Viewer" />
          <Table head={["Member", "Role", "Joined", ""]}>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-5 py-3">
                  <div>{m.user.name || m.user.email}</div>
                  {m.user.name && <div className="text-xs text-dim">{m.user.email}</div>}
                </td>
                <td className="px-5 py-3">
                  {admin && m.userId !== ctx.user.id ? (
                    <form action={changeRole} className="flex gap-2">
                      <input type="hidden" name="membershipId" value={m.id} />
                      <Select name="role" defaultValue={m.role} className="w-auto py-1 text-xs">
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                      <Button className="py-1 text-xs">Set</Button>
                    </form>
                  ) : (
                    <span className="capitalize text-muted">{m.role}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-muted">{fmtDate(m.createdAt)}</td>
                <td className="px-5 py-3 text-right">
                  {admin && m.userId !== ctx.user.id && (
                    <form action={removeMember}>
                      <input type="hidden" name="membershipId" value={m.id} />
                      <Button variant="ghost" className="text-xs">
                        Remove
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          {admin && (
            <div className="space-y-4 border-t border-line p-5">
              <InviteForm action={inviteMember} />
              {invites.length > 0 && (
                <ul className="divide-y divide-line text-sm">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between py-2">
                      <span>
                        {i.email} <span className="text-dim">· {i.role} · expires {fmtDate(i.expiresAt)}</span>
                      </span>
                      <form action={revokeInvite}>
                        <input type="hidden" name="id" value={i.id} />
                        <Button variant="ghost" className="text-xs">
                          Revoke
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Your profile" />
          <form action={saveProfile} className="space-y-4 p-5">
            <Field label="Name">
              <Input name="name" defaultValue={me.name ?? ""} />
            </Field>
            <Field label="Discord user ID" hint="Used for @-mentions in private on-call alerts (Developer Mode → right-click your name → Copy User ID)">
              <Input name="discordUserId" defaultValue={me.discordUserId ?? ""} placeholder="123456789012345678" className="font-mono" />
            </Field>
            <Button variant="primary">Save profile</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Two-factor authentication" description="TOTP apps: Google Authenticator, 1Password, Authy…" />
          <div className="space-y-4 p-5">
            {me.totpEnabled ? (
              <form action={disable2fa} className="flex gap-3">
                <Input name="code" inputMode="numeric" placeholder="Current code" className="max-w-[180px] font-mono" />
                <Button variant="danger">Turn off 2FA</Button>
              </form>
            ) : otp ? (
              <TwoFactorSetup secret={otp} otpauth={otpauthUrl(otp, me.email)} enable={enable2fa} />
            ) : (
              <form action={start2fa}>
                <Button>Set up 2FA</Button>
              </form>
            )}
          </div>
        </Card>

        {admin && (
          <Card>
            <CardHeader title="API keys" description="Scoped keys for the REST API, CI and deployment markers" />
            <div className="space-y-4 p-5">
              <ApiKeyForm action={createApiKey} />
              <ul className="divide-y divide-line text-sm">
                {keys.map((k) => (
                  <li key={k.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div>{k.name}</div>
                      <div className="font-mono text-xs text-dim">
                        {k.prefix}… · {k.scopes} · used {timeAgo(k.lastUsedAt)}
                      </div>
                    </div>
                    <form action={deleteApiKey}>
                      <input type="hidden" name="id" value={k.id} />
                      <Button variant="ghost" className="text-xs">
                        Revoke
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-dim">
                API docs: <a className="underline" href={`${env.appUrl}/api/v1/openapi.json`}>openapi.json</a>
              </p>
            </div>
          </Card>
        )}

        {admin && (
          <Card>
            <CardHeader title="Workspace" description="Incident numbering and alert grouping" />
            <form action={saveWorkspace} className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Name">
                <Input name="name" defaultValue={ctx.workspace.name} />
              </Field>
              <Field label="Incident prefix" hint="Incidents are numbered like SR-12">
                <Input name="incidentPrefix" defaultValue={ctx.workspace.incidentPrefix} maxLength={8} className="font-mono uppercase" />
              </Field>
              <Field label="Group failures within (seconds)" hint="Cascading failures inside this window join one incident. 0 disables grouping." className="sm:col-span-2">
                <Input name="groupingWindowSec" type="number" min={0} max={3600} defaultValue={ctx.workspace.groupingWindowSec} />
              </Field>
              <div className="sm:col-span-2">
                <Button variant="primary">Save workspace</Button>
              </div>
            </form>
            <div className="space-y-3 border-t border-line p-5">
              <div className="flex flex-wrap items-center gap-3">
                <a href="/api/v1/workspace/export" className="inline-flex items-center rounded-lg border border-line-strong bg-card-2 px-3.5 py-2 text-sm hover:bg-card-3">
                  Download JSON backup
                </a>
                <span className="text-xs text-dim">Monitors, pages, themes, custom CSS, incidents and integrations</span>
              </div>
              <form action={importBackup} className="flex flex-wrap items-center gap-3">
                <input type="file" name="file" accept="application/json,.json" required className="text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line-strong file:bg-card-2 file:px-3 file:py-2 file:text-fg" />
                <Button>Restore backup</Button>
              </form>
            </div>
          </Card>
        )}

        {admin && (
          <Card className="lg:col-span-2">
            <CardHeader title="Audit log" description="Append-only record of changes and sign-ins" />
            <Table head={["When", "Actor", "Action", "Target"]}>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap px-5 py-2.5 text-muted">{fmtDate(a.createdAt)}</td>
                  <td className="px-5 py-2.5">{a.actor || "system"}</td>
                  <td className="px-5 py-2.5 font-mono text-xs">{a.action}</td>
                  <td className="max-w-xs truncate px-5 py-2.5 font-mono text-xs text-dim">{a.target || "—"}</td>
                </tr>
              ))}
              {!audit.length && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-muted">
                    No activity yet
                  </td>
                </tr>
              )}
            </Table>
          </Card>
        )}
      </div>
    </>
  );
}
