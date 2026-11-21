"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, ChevronsLeft, ChevronsRight, Globe, HeartPulse, LogOut, Phone, Plug, Users } from "lucide-react";
import { cx } from "./ui";

const NAV = [
  { href: "/dashboard/monitors", label: "Monitors", icon: Activity },
  { href: "/dashboard/incidents", label: "Incidents", icon: AlertTriangle },
  { href: "/dashboard/status-pages", label: "Status Pages", icon: Globe },
  { href: "/dashboard/heartbeats", label: "Heartbeats", icon: HeartPulse },
  { href: "/dashboard/on-call", label: "On-Call", icon: Phone },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { href: "/dashboard/team", label: "Team & Audit Logs", icon: Users },
];

export function Sidebar({
  workspace,
  workspaces,
  user,
  openIncidents,
  switchAction,
  logoutAction,
}: {
  workspace: { id: string; name: string };
  workspaces: { id: string; name: string }[];
  user: { name: string | null; email: string };
  openIncidents: number;
  switchAction: (fd: FormData) => void;
  logoutAction: () => void;
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
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
    <aside className={cx("sticky top-0 flex h-screen shrink-0 flex-col border-r border-line bg-[#0D1016] transition-[width]", collapsed ? "w-[60px]" : "w-[240px]")}>
      <div className="flex h-14 items-center gap-2 border-b border-line px-4">
        <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-up/15">
          <span className="sr-pulse h-2 w-2 rounded-full bg-up text-up" />
        </span>
        {!collapsed && <span className="font-semibold tracking-tight">StatusReport</span>}
      </div>

      {!collapsed && (
        <form action={switchAction} className="border-b border-line px-3 py-3">
          <select
            name="workspaceId"
            defaultValue={workspace.id}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="sr-input cursor-pointer py-1.5 text-[13px]"
            aria-label="Workspace"
          >
            {workspaces.map((w) => (
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

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3 sr-scroll">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={cx(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                active ? "bg-white/[0.07] text-fg" : "text-muted hover:bg-white/[0.04] hover:text-fg",
              )}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{label}</span>}
              {!collapsed && label === "Incidents" && openIncidents > 0 && (
                <span className="rounded-full bg-down/15 px-1.5 text-xs font-medium text-down">{openIncidents}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-2">
        {!collapsed && (
          <div className="px-2.5 py-2">
            <div className="truncate text-sm">{user.name || user.email}</div>
            {user.name && <div className="truncate text-xs text-dim">{user.email}</div>}
          </div>
        )}
        <div className={cx("flex", collapsed ? "flex-col" : "items-center justify-between")}>
          <form action={logoutAction}>
            <button title="Sign out" className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-white/[0.04] hover:text-fg">
              <LogOut size={16} /> {!collapsed && "Sign out"}
            </button>
          </form>
          <button onClick={toggle} title={collapsed ? "Expand" : "Collapse"} className="cursor-pointer rounded-lg px-2.5 py-2 text-muted hover:bg-white/[0.04] hover:text-fg">
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
