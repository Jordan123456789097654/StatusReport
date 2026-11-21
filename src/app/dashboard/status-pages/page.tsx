import Link from "next/link";
import { ExternalLink, Globe } from "lucide-react";
import { Button, Card, CardHeader, Empty, Field, Input, PageHeader, Pill, StatusDot } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { statusPageBase } from "@/lib/urls";
import { createStatusPage } from "../actions/pages";

export const metadata = { title: "Status pages" };

export default async function StatusPagesList() {
  const ctx = await requireWorkspace();
  const pages = await db.statusPage.findMany({
    where: { workspaceId: ctx.workspace.id },
    include: { _count: { select: { components: true, subscribers: true } }, components: { include: { monitor: { select: { status: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <>
      <PageHeader title="Status pages" description="Fully white-label public pages on statusreport.roleflow.site/s/… or your own domain." />
      <Card className="mb-6">
        <CardHeader title="Create a status page" description="All your monitors are added as components. Fine-tune them afterwards." />
        <form action={createStatusPage} className="grid items-end gap-4 p-5 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Name">
            <Input name="name" placeholder={`${ctx.workspace.name} Status`} />
          </Field>
          <Field label="Slug" hint={`${env.appUrl.replace(/^https?:\/\//, "")}/s/your-slug`}>
            <Input name="slug" placeholder="acme" />
          </Field>
          <Button variant="primary">Create</Button>
        </form>
      </Card>
      {pages.length === 0 ? (
        <Empty icon={<Globe size={28} />} title="No status pages yet" description="Create one above to share live uptime and incidents with your users." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {pages.map((p) => {
            const down = p.components.some((c) => c.monitor.status === "down");
            return (
              <Card key={p.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/dashboard/status-pages/${p.id}`} className="flex items-center gap-2 font-semibold hover:underline">
                      <StatusDot status={down ? "down" : "up"} /> {p.name}
                    </Link>
                    <a href={statusPageBase(p)} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 truncate font-mono text-xs text-muted hover:text-fg">
                      {statusPageBase(p).replace(/^https?:\/\//, "")} <ExternalLink size={11} />
                    </a>
                  </div>
                  <Pill status={p.visibility === "public" ? "operational" : "maintenance"}>{p.visibility}</Pill>
                </div>
                <div className="mt-4 flex gap-4 text-xs text-muted">
                  <span>{p._count.components} components</span>
                  <span>{p._count.subscribers} subscribers</span>
                  {p.customDomain && (
                    <span className={p.domainStatus === "verified" ? "text-up" : "text-warn"}>
                      {p.customDomain} · {p.domainStatus}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
