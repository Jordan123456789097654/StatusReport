import { DashboardShell } from "@/components/DashboardShell";
import { WorkerStatus } from "@/components/WorkerStatus";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { incidentLabel } from "@/lib/urls";
import { logout, switchWorkspace } from "../(auth)/actions";

export const dynamic = "force-dynamic";
// "Check now" runs a monitor check inside a server action; allow it more than the default 10s on Vercel.
export const maxDuration = 30;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();
  const wid = ctx.workspace.id;
  const [memberships, openIncidents, monitors, pages, incidents] = await Promise.all([
    db.membership.findMany({ where: { userId: ctx.user.id }, include: { workspace: true }, orderBy: { createdAt: "asc" } }),
    db.incident.count({ where: { workspaceId: wid, resolvedAt: null } }),
    db.monitor.findMany({ where: { workspaceId: wid }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" }, take: 100 }),
    db.statusPage.findMany({ where: { workspaceId: wid }, select: { id: true, name: true }, take: 30 }),
    db.incident.findMany({ where: { workspaceId: wid }, select: { id: true, title: true, number: true }, orderBy: { startedAt: "desc" }, take: 15 }),
  ]);
  return (
    <DashboardShell
      workspace={{ id: wid, name: ctx.workspace.name }}
      workspaces={memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name }))}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      openIncidents={openIncidents}
      palette={{ monitors, pages, incidents: incidents.map((i) => ({ id: i.id, title: i.title, label: incidentLabel(ctx.workspace.incidentPrefix, i.number) })) }}
      switchAction={switchWorkspace}
      logoutAction={logout}
      banner={<WorkerStatus />}
    >
      {children}
    </DashboardShell>
  );
}
