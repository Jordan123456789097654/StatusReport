import { Button, Card, PageHeader, Table } from "@/components/ui";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { deleteIssueReport } from "../../actions/incidents";
import { IncidentTabs } from "../tabs";

export const metadata = { title: "User reports" };

export default async function ReportsPage() {
  const ctx = await requireWorkspace();
  const reports = await db.issueReport.findMany({
    where: { statusPage: { workspaceId: ctx.workspace.id } },
    include: { statusPage: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const comps = await db.statusPageComponent.findMany({ where: { id: { in: reports.map((r) => r.componentId).filter((x): x is string => Boolean(x)) } }, include: { monitor: true } });
  return (
    <>
      <PageHeader title="Incidents" description='Reports submitted via the "Report an issue" widget on your status pages (rate-limited per visitor).' />
      <IncidentTabs active="reports" />
      <Card>
        <Table head={["Received", "Page", "Component", "Message", "Contact", ""]}>
          {reports.map((r) => {
            const c = comps.find((x) => x.id === r.componentId);
            return (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-5 py-3 text-muted">{fmtDate(r.createdAt)}</td>
                <td className="px-5 py-3">{r.statusPage.name}</td>
                <td className="px-5 py-3 text-muted">{c ? c.displayName || c.monitor.name : "—"}</td>
                <td className="max-w-md px-5 py-3">{r.message}</td>
                <td className="px-5 py-3 text-muted">{r.email || "—"}</td>
                <td className="px-5 py-3">
                  <form action={deleteIssueReport}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button variant="ghost" className="text-xs">
                      Dismiss
                    </Button>
                  </form>
                </td>
              </tr>
            );
          })}
          {!reports.length && (
            <tr>
              <td colSpan={6} className="px-5 py-6 text-center text-muted">
                No reports. Enable the widget in a status page&apos;s General settings.
              </td>
            </tr>
          )}
        </Table>
      </Card>
    </>
  );
}
