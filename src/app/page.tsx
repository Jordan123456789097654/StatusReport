import Link from "next/link";
import { Activity, AlertTriangle, Bell, Globe, HeartPulse, Layers, Lock, Phone, Plug, Users, Zap } from "lucide-react";
import { LinkButton, Logo } from "@/components/ui";
import { Sandbox } from "@/components/Sandbox";
import { sampleViewData } from "@/lib/sample";
import { env } from "@/lib/env";

export const metadata = { title: "Free uptime monitoring & status pages" };

const FEATURES = [
  { icon: Activity, title: "Multi-protocol monitoring", body: "HTTP(S), keyword, JSON path, TCP/UDP, ping, DNS drift, SSL and domain expiry. Sub-minute intervals." },
  { icon: Globe, title: "Status pages that look good", body: "Drag-and-drop builder, five themes, custom CSS, your own domain with automatic SSL, and multi-language." },
  { icon: Bell, title: "Public & private Discord", body: "Community-facing embeds for customers, detailed diagnostics for your team, fully customisable templates." },
  { icon: AlertTriangle, title: "Incident lifecycle", body: "Auto-created and auto-resolved incidents, timeline updates, post-mortems and MTTA/MTTR analytics." },
  { icon: Phone, title: "On-call & escalation", body: "Rotations, multi-tier escalation policies and one-click acknowledgement from Discord or email." },
  { icon: HeartPulse, title: "Heartbeats for cron jobs", body: "Give every backup and job its own URL. We alert when a check-in is missed." },
  { icon: Plug, title: "API, IaC & deploy markers", body: "Scoped API keys, YAML config sync, OpenAPI docs and deployment markers on response-time graphs." },
  { icon: Users, title: "Teams & security", body: "Owner, admin, responder and viewer roles, TOTP 2FA, OAuth, audit logs and one-click backups." },
  { icon: Lock, title: "Free forever, self-hostable", body: "No paywalls, no monitor or user limits. Run it on SQLite with one Docker command, or PostgreSQL for SaaS." },
];

export default function Landing() {
  const sample = sampleViewData();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="StatusReport home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="#sandbox" className="hidden px-3 text-sm text-muted hover:text-fg sm:inline">
              Live demo
            </Link>
            <Link href="#features" className="hidden px-3 text-sm text-muted hover:text-fg sm:inline">
              Features
            </Link>
            <LinkButton href="/login">Sign in</LinkButton>
            <LinkButton href="/register" variant="primary">
              Start free
            </LinkButton>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,197,94,0.14),transparent_55%)]" />
        <div className="relative mx-auto max-w-4xl px-6 pb-16 pt-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-card px-3 py-1 text-xs text-muted">
            <Zap size={12} className="text-up" /> 100% free · open source · zero limits
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">Know before your users do.</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
            Uptime monitoring, incident management, on-call and beautiful status pages, with no paywalls and no monitor limits.
          </p>
          <div className="mt-9 flex flex-wrap justify-center gap-3">
            <LinkButton href="/register" variant="primary" className="px-5 py-2.5">
              Create free account
            </LinkButton>
            <LinkButton href="#sandbox" className="px-5 py-2.5">
              Try the live demo
            </LinkButton>
          </div>
          <p className="mt-5 font-mono text-xs text-dim">
            {env.appUrl.replace(/^https?:\/\//, "")} · status pages at /s/your-slug or your own domain
          </p>
        </div>
      </section>

      <section id="sandbox" className="mx-auto max-w-6xl px-6 pb-20">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Test-drive a status page</h2>
          <p className="mt-2 text-sm text-muted">Switch themes, simulate an outage and see the Discord alert it would send. No sign-up needed.</p>
        </div>
        <Sandbox data={sample} appUrl={env.appUrl} />
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-line bg-card p-6">
              <f.icon size={20} className="text-up" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-line bg-card p-8 text-center sm:p-12">
          <Layers size={24} className="mx-auto text-up" />
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">Run it yourself in one command</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
            SQLite for a single-file self-host, or PostgreSQL for multi-tenant SaaS. Docker Compose brings up the app, worker and database together.
          </p>
          <pre className="mx-auto mt-6 max-w-sm overflow-x-auto rounded-lg border border-line-strong bg-bg px-5 py-3 text-left font-mono text-sm text-fg">docker compose up -d</pre>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-xs text-dim">
          <span>© {new Date().getFullYear()} StatusReport · MIT licensed</span>
          <span className="flex gap-4">
            <Link href="/docs" className="hover:text-muted">
              Docs
            </Link>
            <a href="/api/v1/openapi.json" className="hover:text-muted">
              API
            </a>
            <Link href="/login" className="hover:text-muted">
              Sign in
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
