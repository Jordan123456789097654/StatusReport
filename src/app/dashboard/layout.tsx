import { Sidebar } from "@/components/Sidebar";
import { WorkerStatus } from "@/components/WorkerStatus";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { logout, switchWorkspace } from "../(auth)/actions";

export const dynamic = "force-dynamic";
// "Check now" runs a monitor check inside a server action; allow it more than the default 10s on Vercel.
export const maxDuration = 30;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();
  const [memberships, openIncidents] = await Promise.all([
    db.membership.findMany({ where: { userId: ctx.user.id }, include: { workspace: true }, orderBy: { createdAt: "asc" } }),
    db.incident.count({ where: { workspaceId: ctx.workspace.id, resolvedAt: null } }),
  ]);
  return (
    <div className="flex min-h-screen">
      <Sidebar
        workspace={{ id: ctx.workspace.id, name: ctx.workspace.name }}
        workspaces={memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name }))}
        user={{ name: ctx.user.name, email: ctx.user.email }}
        openIncidents={openIncidents}
        switchAction={switchWorkspace}
        logoutAction={logout}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
          <WorkerStatus />
          {children}
        </div>
      </main>
    </div>
  );
}
