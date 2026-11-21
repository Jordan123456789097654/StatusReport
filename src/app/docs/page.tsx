import Link from "next/link";
import { CopyField } from "@/components/CopyButton";
import { env } from "@/lib/env";

export const metadata = { title: "Docs" };

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-20 space-y-3 border-t border-line pt-8">
    <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
    <div className="space-y-3 text-sm leading-relaxed text-muted">{children}</div>
  </section>
);

export default function Docs() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-muted hover:text-fg">
        ← StatusReport
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Documentation</h1>
      <p className="mt-2 text-sm text-muted">Setup notes for the hosted service and self-hosted installs.</p>

      <div className="mt-10 space-y-10">
        <Section id="custom-domains" title="Custom domains">
          <p>
            Open a status page, go to <em>Custom domain</em>, and enter a hostname such as <code className="font-mono">status.example.com</code>. Then add a CNAME record at your DNS provider:
          </p>
          <div className="space-y-2">
            <div className="text-xs text-dim">Record type</div>
            <CopyField value="CNAME" />
            <div className="text-xs text-dim">Host</div>
            <CopyField value="status.example.com" />
            <div className="text-xs text-dim">Target</div>
            <CopyField value={env.cnameTarget} />
          </div>
          <p>
            We check DNS automatically and provision an SSL certificate once it resolves. Apex domains work through CNAME flattening (Cloudflare) or A records that match the target.
          </p>
        </Section>

        <Section id="api" title="REST API">
          <p>
            Create a scoped key under Team &amp; audit logs, then send it as a bearer token. The full specification is at{" "}
            <a className="text-fg underline underline-offset-2" href="/api/v1/openapi.json">
              /api/v1/openapi.json
            </a>
            .
          </p>
          <CopyField value={`curl -H "Authorization: Bearer sr_live_…" ${env.appUrl}/api/v1/monitors`} />
        </Section>

        <Section id="heartbeats" title="Heartbeats (cron jobs)">
          <p>Append a request to the end of your job. Use a failure flag to report errors explicitly.</p>
          <CopyField value={`0 3 * * * /usr/local/bin/backup.sh && curl -fsS --retry 3 ${env.appUrl}/api/v1/heartbeat/<token>`} />
        </Section>

        <Section id="self-hosting" title="Self-hosting">
          <p>
            Copy <code className="font-mono">.env.example</code> to <code className="font-mono">.env</code>, set <code className="font-mono">AUTH_SECRET</code>, then run{" "}
            <code className="font-mono">docker compose up -d</code>. The default uses SQLite; set <code className="font-mono">DATABASE_URL</code> to a PostgreSQL URL for multi-tenant SaaS.
          </p>
          <p>
            Set <code className="font-mono">SAAS_MODE=false</code> to keep registration closed after the first account.
          </p>
        </Section>
      </div>
    </div>
  );
}
