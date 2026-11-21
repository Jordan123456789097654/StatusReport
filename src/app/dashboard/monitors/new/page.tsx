import { MonitorForm } from "@/components/MonitorForm";
import { Flash, PageHeader } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveMonitor } from "../../actions/monitors";

export const metadata = { title: "Create monitor" };

export default async function NewMonitor({ searchParams }: { searchParams: Promise<{ error?: string; type?: string }> }) {
  const ctx = await requireWorkspace("admin");
  const sp = await searchParams;
  const policies = await db.escalationPolicy.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Create monitor" back={{ href: "/dashboard/monitors", label: "Monitors" }} />
      <Flash error={sp.error} />
      <MonitorForm initialType={sp.type} policies={policies} action={saveMonitor} />
    </>
  );
}
