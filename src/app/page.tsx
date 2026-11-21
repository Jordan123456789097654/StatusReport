import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, Bell, Globe, HeartPulse, Infinity as InfinityIcon, Phone, Plug, Users } from "lucide-react";
import { FadeUp, HoverLift, Reveal } from "@/components/motion";
import { Sandbox } from "@/components/Sandbox";
import { Screenshot } from "@/components/Screenshot";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LinkButton, Logo, LogoMark } from "@/components/ui";
import { env } from "@/lib/env";
import { sampleViewData } from "@/lib/sample";

export const metadata = { title: "Know before your users do" };

const FEATURES = [
  { icon: Activity, title: "Monitor anything", body: "HTTP(S), keywords, JSON, TCP/UDP, ping, DNS drift, SSL and domain expiry, down to 10-second checks." },
  { icon: Globe, title: "Status pages people trust", body: "A visual builder, light and dark themes, your own domain with automatic SSL, and 5 languages." },
  { icon: Bell, title: "Public and private alerts", body: "Clean Discord embeds for customers, detailed diagnostics for your team, plus Slack, Teams, Telegram and email." },
  { icon: AlertTriangle, title: "Incidents that run themselves", body: "Opened on confirmed failures, grouped when things cascade, resolved on recovery, with post-mortems." },
  { icon: Phone, title: "On-call & escalation", body: "Rotations, multi-step escalation and one-click acknowledgement from the alert itself." },
  { icon: HeartPulse, title: "Heartbeats for cron jobs", body: "Every backup and job gets its own URL. Miss a check-in and you hear about it." },
  { icon: Plug, title: "API & automation", body: "Scoped API keys, YAML config sync, deployment markers on graphs, and OpenAPI docs." },
  { icon: Users, title: "Teams & security", body: "Four roles, two-factor auth, OAuth sign-in, audit logs and one-click backups." },
  { icon: InfinityIcon, title: "Free. Really.", body: "No monitor limits, no user limits, no locked features. Self-host it or use ours." },
];

const SHOTS = [
  { name: "monitors", title: "Every monitor at a glance", body: "Live state, 30-day uptime and last check for everything you run." },
  { name: "monitor-detail", title: "Know exactly what happened", body: "Uptime history, a response-time chart and a DNS, TCP, TLS and first-byte breakdown." },
  { name: "incident", title: "Incidents with a timeline", body: "Auto-created, acknowledged in one click, updated in Markdown, published to your page." },
  { name: "status-page", title: "A status page that looks like yours", body: "90-day uptime bars, incident history and subscriptions, themed in light or dark." },
  { name: "builder", title: "Design it visually", body: "Drag blocks, pick a theme, tune colors and fonts, and preview an outage before you publish." },
  { name: "discord", title: "Alerts people actually read", body: "Public and private Discord messages with a live preview and a full template editor." },
];

export default function Landing() {
  const sample = sampleViewData();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="StatusReport home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1.5 sm:gap-3">
            <Link href="#demo" className="hidden px-2 text-sm text-muted transition-colors hover:text-fg sm:inline">
              Live demo
            </Link>
            <Link href="#product" className="hidden px-2 text-sm text-muted transition-colors hover:text-fg sm:inline">
              Product
            </Link>
            <Link href="/status" className="hidden px-2 text-sm text-muted transition-colors hover:text-fg sm:inline">
              Status
            </Link>
            <ThemeToggle compact />
            <LinkButton href="/login" variant="ghost">
              Sign in
            </LinkButton>
            <LinkButton href="/register" variant="primary">
              Start free
            </LinkButton>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-4xl px-5 pb-14 pt-20 text-center sm:pt-28">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-card px-3 py-1 text-xs text-muted shadow-sm">
              <span className="sr-pulse inline-block h-1.5 w-1.5 rounded-full bg-up text-up" />
              Free forever · open source · no limits
            </span>
          </Reveal>
          <Reveal delay={0.08}>
            <h1 className="mt-6 text-balance text-5xl font-semibold tracking-tight sm:text-7xl">Know before your users do.</h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted">
              Uptime monitoring, incident management, on-call and status pages in one calm, fast tool. Unlimited monitors, unlimited teammates, zero paywalls.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <LinkButton href="/register" variant="primary" className="px-5 py-2.5 text-[15px]">
                Create free account <ArrowRight size={16} />
              </LinkButton>
              <LinkButton href="#demo" className="px-5 py-2.5 text-[15px]">
                Try the live demo
              </LinkButton>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24">
        <FadeUp className="mb-7 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Try it right here</h2>
          <p className="mt-2 text-sm text-muted">Switch themes, simulate an outage, and see the Discord alert it would send. No sign-up.</p>
        </FadeUp>
        <FadeUp delay={0.05}>
          <Sandbox data={sample} appUrl={env.appUrl} />
        </FadeUp>
      </section>

      <section id="product" className="mx-auto max-w-6xl scroll-mt-20 px-5 pb-24">
        <FadeUp className="mb-12 text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-5xl">The real product, not a mock-up</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">These are screenshots of StatusReport running with sample data.</p>
        </FadeUp>
        <div className="space-y-20">
          {SHOTS.map((s, i) => (
            <FadeUp key={s.name} className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-14 ${i % 2 ? "lg:[&>*:first-child]:order-2" : ""}`}>
              <div>
                <h3 className="text-2xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-3 max-w-md text-muted">{s.body}</p>
              </div>
              <Screenshot name={s.name} alt={s.title} priority={i === 0} />
            </FadeUp>
          ))}
        </div>
      </section>

      <section className="border-t border-line bg-card-2/50">
        <div className="mx-auto max-w-6xl px-5 py-24">
          <FadeUp className="mb-12 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Everything you need. Nothing locked.</h2>
          </FadeUp>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <FadeUp key={f.title} delay={(i % 3) * 0.06}>
                <HoverLift className="h-full rounded-xl border border-line bg-card p-6 shadow-card">
                  <f.icon size={20} className="text-fg" />
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
                </HoverLift>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-24 text-center">
        <FadeUp>
          <LogoMark size={44} className="mx-auto" />
          <h2 className="mt-6 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">Start monitoring in two minutes.</h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">Create an account, add a URL, and your first status page is live.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <LinkButton href="/register" variant="primary" className="px-5 py-2.5 text-[15px]">
              Create free account <ArrowRight size={16} />
            </LinkButton>
            <LinkButton href="/docs" className="px-5 py-2.5 text-[15px]">
              Read the docs
            </LinkButton>
          </div>
        </FadeUp>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs text-dim">
          <span className="flex items-center gap-2">
            <LogoMark size={18} /> StatusReport · Calm uptime monitoring · MIT licensed
          </span>
          <span className="flex gap-5">
            <Link href="/status" className="hover:text-muted">
              System status
            </Link>
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
