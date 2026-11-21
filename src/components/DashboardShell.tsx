"use client";

import { AnimatePresence, motion } from "motion/react";
import { Activity, AlertTriangle, ChevronsLeft, ChevronsRight, Globe, HeartPulse, LogOut, Menu, Phone, Plug, Search, Users, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { CommandPalette, type PaletteData } from "./CommandPalette";
import { PageTransition } from "./motion";
import { ThemeToggle } from "./ThemeToggle";
import { LogoMark, cx } from "./ui";

const NAV = [
  { href: "/dashboard/monitors", label: "Monitors", icon: Activity },
  { href: "/dashboard/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/dashboard/status-pages", label: "Status Pages", icon: Globe },
  { href: "/dashboard/heartbeats", label: "Heartbeats", icon: HeartPulse },
  { href: "/dashboard/on-call", label: "On-Call", icon: Phone },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/team", label: "Team & Audit Logs", icon: Users },
];

type Props = {
  workspace: { id: string; name: string };
  workspaces: { id: string; name: string }[];
  user: { name: string | null; email: string };
  openIncidents: number;
  palette: PaletteData;
  switchAction: (fd: FormData) => void;
  logoutAction: () => void;
  banner?: ReactNode;
  children: ReactNode;
};

function NavList({ collapsed, openIncidents, onNavigate }: { collapsed: boolean; openIncidents: number; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 sr-scroll">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={cx("relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors", active ? "text-fg" : "text-muted hover:text-fg hover:bg-fg/[0.04]")}
          >
            {active && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-fg/[0.07]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <Icon size={17} className="relative shrink-0" />
            {!collapsed && <span className="relative flex-1 truncate">{label}</span>}
            {!collapsed && label === "Incidents" && openIncidents > 0 && <span className="relative rounded-full bg-down/15 px-1.5 text-xs font-medium text-down">{openIncidents}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ collapsed, onNavigate, ...p }: Props & { collapsed: boolean; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
        <LogoMark size={26} />
        {!collapsed && <span className="font-semibold tracking-tight">StatusReport</span>}
      </div>
      {!collapsed && (
        <form action={p.switchAction} className="border-b border-line px-3 py-3">
          <select name="workspaceId" defaultValue={p.workspace.id} onChange={(e) => e.currentTarget.form?.requestSubmit()} className="sr-input cursor-pointer py-1.5 text-[13px]" aria-label="Workspace">
            {p.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <Link href="/onboarding" className="mt-1.5 block px-1 text-xs text-dim hover:text-muted">
            + New workspace
          </Link>
        </form>
      )}
      <NavList collapsed={collapsed} openIncidents={p.openIncidents} onNavigate={onNavigate} />
      <div className="border-t border-line p-2">
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fg/10 text-xs font-semibold">{(p.user.name || p.user.email)[0]?.toUpperCase()}</span>
            <div className="min-w-0">
              <div className="truncate text-sm">{p.user.name || p.user.email}</div>
              {p.user.name && <div className="truncate text-xs text-dim">{p.user.email}</div>}
            </div>
          </div>
        )}
        <form action={p.logoutAction}>
          <button title="Sign out" className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-fg/[0.04] hover:text-fg">
            <LogOut size={16} /> {!collapsed && "Sign out"}
          </button>
        </form>
      </div>
    </>
  );
}

export function DashboardShell(props: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sr_sidebar") === "1");
    } catch {}
  }, []);
  const toggle = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem("sr_sidebar", collapsed ? "0" : "1");
    } catch {}
  };

  return (
    <div className="flex min-h-screen">
      <aside className={cx("sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-card transition-[width] duration-200 lg:flex", collapsed ? "w-[60px]" : "w-[248px]")}>
        <SidebarBody {...props} collapsed={collapsed} />
        <button onClick={toggle} title={collapsed ? "Expand" : "Collapse"} className="absolute -right-3 top-[68px] flex h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-line-strong bg-card text-muted shadow-sm hover:text-fg">
          {collapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}
        </button>
      </aside>

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDrawer(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-line bg-card shadow-pop lg:hidden" initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "spring", stiffness: 420, damping: 38 }}>
              <button onClick={() => setDrawer(false)} className="absolute right-3 top-3.5 cursor-pointer text-muted" aria-label="Close menu">
                <X size={18} />
              </button>
              <SidebarBody {...props} collapsed={false} onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-md lg:px-8">
          <button onClick={() => setDrawer(true)} className="cursor-pointer text-muted hover:text-fg lg:hidden" aria-label="Open menu">
            <Menu size={20} />
          </button>
          <button onClick={() => setPaletteOpen(true)} className="flex h-9 w-full max-w-sm cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-card px-3 text-sm text-dim shadow-sm transition-colors hover:text-muted">
            <Search size={15} />
            <span className="flex-1 text-left">Search or jump to…</span>
            <kbd className="hidden rounded border border-line-strong px-1.5 py-0.5 font-mono text-[10px] sm:block">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 lg:px-10">
          {props.banner}
          <PageTransition>{props.children}</PageTransition>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} data={props.palette} logout={props.logoutAction} />
    </div>
  );
}
