// Signed one-click acknowledgement link (from private Discord/email alerts). A GET only shows
// a confirmation; the POST does the work, so link unfurlers and mail scanners can't auto-ack.
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { db } from "@/lib/db";
import { verifySignature } from "@/lib/crypto";
import { acknowledgeIncident } from "@/lib/incidents";
import { incidentLabel } from "@/lib/urls";
import { Button, Card, Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

async function ack(fd: FormData) {
  "use server";
  const id = String(fd.get("id"));
  const sig = String(fd.get("sig"));
  if (!verifySignature(`ack:${id}`, sig)) redirect(`/ack/${id}?sig=${encodeURIComponent(sig)}&error=1`);
  await acknowledgeIncident(id, "signed alert link");
  redirect(`/ack/${id}?sig=${encodeURIComponent(sig)}&done=1`);
}

export default async function AckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sig?: string; done?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const valid = verifySignature(`ack:${id}`, sp.sig);
  const incident = valid ? await db.incident.findUnique({ where: { id }, include: { workspace: true } }) : null;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Logo className="mb-8" />
      <Card className="w-full max-w-md p-7 text-center">
        {!incident ? (
          <p className="text-sm text-muted">This acknowledgement link is invalid.</p>
        ) : (
          <>
            <div className="text-xs uppercase tracking-wide text-dim">Incident #{incidentLabel(incident.workspace.incidentPrefix, incident.number)}</div>
            <h1 className="mt-1 text-lg font-semibold">{incident.title}</h1>
            {incident.acknowledgedAt || sp.done ? (
              <p className="mt-5 inline-flex items-center gap-2 text-sm text-up">
                <CheckCircle2 size={16} /> Acknowledged{incident.acknowledgedBy ? ` by ${incident.acknowledgedBy}` : ""}. Escalation stopped.
              </p>
            ) : incident.resolvedAt ? (
              <p className="mt-5 text-sm text-muted">This incident is already resolved.</p>
            ) : (
              <form action={ack} className="mt-6">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="sig" value={sp.sig} />
                <Button variant="primary" className="w-full">
                  Acknowledge incident
                </Button>
              </form>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
