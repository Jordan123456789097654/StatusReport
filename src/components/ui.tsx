// Server-safe UI primitives (no hooks). Colors come from CSS tokens, so light and dark both work.
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-fg text-bg font-medium shadow-sm hover:opacity-85",
  secondary: "bg-card text-fg border border-line-strong shadow-sm hover:bg-card-2",
  danger: "bg-down/10 text-down border border-down/30 hover:bg-down/20",
  ghost: "text-muted hover:text-fg hover:bg-fg/5",
};
const btn = "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-[background-color,opacity,transform,box-shadow] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 cursor-pointer whitespace-nowrap";

export function Button({ variant = "secondary", className, ...p }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(btn, VARIANTS[variant], className)} {...p} />;
}

export function LinkButton({ variant = "secondary", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(btn, VARIANTS[variant], className)} {...p} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-line bg-card shadow-card", className)} {...p} />;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-3 inline-block text-sm text-muted hover:text-fg">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-fg/90">
      {children}
    </label>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-dim">{hint}</p>}
    </div>
  );
}

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx("sr-input", className)} {...p} />;
}

export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx("sr-input font-mono text-[13px]", className)} {...p} />;
}

export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select className={cx("sr-input", className)} {...p} />;
}

export function Checkbox({ label, hint, ...p }: ComponentProps<"input"> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--fg)]" {...p} />
      <span>
        {label}
        {hint && <span className="block text-xs text-dim">{hint}</span>}
      </span>
    </label>
  );
}

const DOT: Record<string, string> = {
  up: "text-up bg-up",
  operational: "text-up bg-up",
  down: "text-down bg-down",
  major: "text-down bg-down",
  partial: "text-[#F97316] bg-[#F97316]",
  degraded: "text-warn bg-warn",
  maintenance: "text-maint bg-maint",
  paused: "text-dim bg-dim",
  pending: "text-dim bg-dim",
};

export function StatusDot({ status, pulse = true, className }: { status: string; pulse?: boolean; className?: string }) {
  return <span className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", DOT[status] || DOT.pending, pulse && status !== "paused" && status !== "pending" && "sr-pulse", className)} />;
}

const PILL: Record<string, string> = {
  up: "bg-up/10 text-up border-up/25",
  operational: "bg-up/10 text-up border-up/25",
  resolved: "bg-up/10 text-up border-up/25",
  down: "bg-down/10 text-down border-down/25",
  major: "bg-down/10 text-down border-down/25",
  investigating: "bg-down/10 text-down border-down/25",
  partial: "bg-[#F97316]/10 text-[#F97316] border-[#F97316]/25",
  identified: "bg-[#F97316]/10 text-[#F97316] border-[#F97316]/25",
  degraded: "bg-warn/10 text-warn border-warn/25",
  monitoring: "bg-warn/10 text-warn border-warn/25",
  maintenance: "bg-maint/10 text-maint border-maint/25",
  scheduled: "bg-maint/10 text-maint border-maint/25",
  in_progress: "bg-maint/10 text-maint border-maint/25",
};

export function Pill({ status, children, className }: { status: string; children?: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize", PILL[status] || "border-line-strong bg-fg/5 text-muted", className)}>
      {children ?? status.replace("_", " ")}
    </span>
  );
}

export function Empty({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
      {icon && <div className="mb-3 text-dim">{icon}</div>}
      <h3 className="font-medium">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "up" | "down" | "warn" }) {
  return (
    <Card className="px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-dim">{label}</div>
      <div className={cx("mt-1.5 text-xl font-semibold tabular-nums", tone === "up" && "text-up", tone === "down" && "text-down", tone === "warn" && "text-warn")}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function Tabs({ tabs, active }: { tabs: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line sr-scroll">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cx("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm", t.key === active ? "border-fg text-fg" : "border-transparent text-muted hover:text-fg")}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function Flash({ error, ok }: { error?: string | string[]; ok?: string | string[] }) {
  const e = Array.isArray(error) ? error[0] : error;
  const o = Array.isArray(ok) ? ok[0] : ok;
  if (!e && !o) return null;
  return (
    <div className={cx("mb-5 rounded-lg border px-4 py-3 text-sm", e ? "border-down/30 bg-down/10 text-down" : "border-up/30 bg-up/10 text-up")}>{e || o}</div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto sr-scroll">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-dim">
            {head.map((h, i) => (
              <th key={i} className="px-5 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-fg/[0.06] px-1.5 py-0.5 font-mono text-[12.5px] text-fg/90">{children}</code>;
}

export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--fg)" />
      <path d="M6 17h5l3-7 4 12 3-5h5" fill="none" stroke="var(--bg)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="8" r="2.6" fill="#22c55e" />
    </svg>
  );
}

export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <LogoMark size={size} />
      StatusReport
    </span>
  );
}
