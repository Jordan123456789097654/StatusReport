import Link from "next/link";
import { Plug } from "lucide-react";
import { Card, CardHeader, Empty, LinkButton, PageHeader, Pill, Table } from "@/components/ui";
import { CopyField } from "@/components/CopyButton";
import { CHANNEL_TYPES } from "@/lib/notify/types";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { env } from "@/lib/env";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const ctx = await requireWorkspace();
  const channels = await db.alertChannel.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } });
  const logs = await db.notificationLog.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, take: 15 });
  return (
    <>
      <PageHeader title="Integrations" description="Public and private Discord, Slack, Teams, Telegram, email and generic webhooks." />

      {channels.length === 0 ? (
        <Empty icon={<Plug size={28} />} title="No integrations yet" description="Pick a destination below. Discord has a dedicated public/private template editor." />
      ) : (
        <Card className="mb-6">
          <Table head={["Name", "Type", "Audience", "Events", "State", ""]}>
            {channels.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-3 font-medium">{c.name}</td>
                <td className="px-5 py-3 capitalize text-muted">{c.type}</td>
                <td className="px-5 py-3">
                  <Pill status={c.visibility === "public" ? "operational" : "maintenance"}>{c.visibility === "public" ? "Public" : "Private (ops)"}</Pill>
                </td>
                <td className="max-w-xs truncate px-5 py-3 text-xs text-muted">{c.events.split(",").join(" · ")}</td>
                <td className="px-5 py-3">{c.enabled ? <span className="text-up">On</span> : <span className="text-dim">Off</span>}</td>
                <td className="px-5 py-3 text-right">
                  <Link href={`/dashboard/integrations/${c.id}`} className="text-sm text-muted hover:text-fg">
                    Configure →
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader title="Add an integration" />
        <div className="grid gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
          {CHANNEL_TYPES.map((t) => (
            <LinkButton key={t.value} href={`/dashboard/integrations/new?type=${t.value}`} className="justify-start">
              {t.label}
            </LinkButton>
          ))}
        </div>
      </Card>

      <Card className="mb-6">
        <CardHeader title="Recent deliveries" />
        <Table head={["When", "Kind", "Result"]}>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="px-5 py-2.5 text-muted">{fmtDate(l.createdAt)}</td>
              <td className="px-5 py-2.5 font-mono text-xs">{l.kind}</td>
              <td className={`px-5 py-2.5 text-xs ${l.ok ? "text-up" : "text-down"}`}>{l.ok ? "delivered" : l.error || "failed"}</td>
            </tr>
          ))}
          {!logs.length && (
            <tr>
              <td colSpan={3} className="px-5 py-6 text-center text-muted">
                Nothing sent yet
              </td>
            </tr>
          )}
        </Table>
      </Card>

      <Card>
        <CardHeader title="Developer API" description="Scoped keys and endpoints" />
        <div className="space-y-3 p-5 text-sm text-muted">
          <p>
            Create keys under <Link href="/dashboard/team" className="text-fg underline underline-offset-2">Team &amp; audit logs → API keys</Link>.
          </p>
          <CopyField value={`${env.appUrl}/api/v1/openapi.json`} />
          <CopyField value={`${env.appUrl}/api/v1/heartbeat/<token>`} />
        </div>
      </Card>
    </>
  );
}
