"use client";

import { Command } from "cmdk";
import { Activity, AlertTriangle, CornerDownLeft, Globe, HeartPulse, LogOut, Monitor, Moon, Phone, Plug, Plus, Search, Sun, Users } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, type ReactNode } from "react";

export type PaletteData = {
  monitors: { id: string; name: string; status: string }[];
  pages: { id: string; name: string }[];
  incidents: { id: string; title: string; label: string }[];
};

const NAV = [
  { label: "Monitors", href: "/dashboard/monitors", icon: Activity },
  { label: "Incidents", href: "/dashboard/incidents", icon: AlertTriangle },
  { label: "Status pages", href: "/dashboard/status-pages", icon: Globe },
  { label: "Heartbeats", href: "/dashboard/heartbeats", icon: HeartPulse },
  { label: "On-call", href: "/dashboard/on-call", icon: Phone },
  { label: "Integrations", href: "/dashboard/integrations", icon: Plug },
  { label: "Team & audit logs", href: "/dashboard/team", icon: Users },
];

const itemCls =
  "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm text-fg/90 aria-selected:bg-fg/[0.07] aria-selected:text-fg";

function Item({ icon, children, onSelect, hint, value }: { icon: ReactNode; children: ReactNode; onSelect: () => void; hint?: string; value?: string }) {
  return (
    <Command.Item value={value} onSelect={onSelect} className={itemCls}>
      <span className="text-muted">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {hint && <span className="text-xs text-dim">{hint}</span>}
    </Command.Item>
  );
}

export function CommandPalette({ open, onOpenChange, data, logout }: { open: boolean; onOpenChange: (o: boolean) => void; data: PaletteData; logout: () => void }) {
  const router = useRouter();
  const { setTheme } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [router, onOpenChange],
  );

  return (
    <Command.Dialog open={open} onOpenChange={onOpenChange} label="Command palette" overlayClassName="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] animate-fade-in" contentClassName="fixed left-1/2 top-[14vh] z-50 w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line-strong bg-card shadow-pop animate-pop">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={16} className="text-dim" />
        <Command.Input placeholder="Search monitors, incidents, pages, or type a command…" className="h-12 w-full bg-transparent text-sm text-fg outline-none placeholder:text-dim" />
        <kbd className="rounded border border-line-strong px-1.5 py-0.5 font-mono text-[10px] text-dim">ESC</kbd>
      </div>
      <Command.List className="max-h-[52vh] overflow-y-auto p-2 sr-scroll">
        <Command.Empty className="px-3 py-8 text-center text-sm text-muted">Nothing found.</Command.Empty>

        <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-dim">
          {NAV.map((n) => (
            <Item key={n.href} icon={<n.icon size={16} />} onSelect={() => go(n.href)}>
              {n.label}
            </Item>
          ))}
        </Command.Group>

        <Command.Group heading="Create" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-dim">
          <Item icon={<Plus size={16} />} onSelect={() => go("/dashboard/monitors/new")}>
            New monitor
          </Item>
          <Item icon={<Plus size={16} />} onSelect={() => go("/dashboard/incidents/new")}>
            Declare incident
          </Item>
          <Item icon={<Plus size={16} />} onSelect={() => go("/dashboard/incidents/maintenance")}>
            Schedule maintenance
          </Item>
          <Item icon={<Plus size={16} />} onSelect={() => go("/dashboard/integrations/new?type=discord")}>
            Add Discord webhook
          </Item>
        </Command.Group>

        {data.monitors.length > 0 && (
          <Command.Group heading="Monitors" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-dim">
            {data.monitors.map((m) => (
              <Item key={m.id} value={`monitor ${m.name}`} icon={<span className={`block h-2 w-2 rounded-full ${m.status === "down" ? "bg-down" : m.status === "degraded" ? "bg-warn" : m.status === "up" ? "bg-up" : "bg-dim"}`} />} onSelect={() => go(`/dashboard/monitors/${m.id}`)}>
                {m.name}
              </Item>
            ))}
          </Command.Group>
        )}

        {data.pages.length > 0 && (
          <Command.Group heading="Status pages" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-dim">
            {data.pages.map((p) => (
              <Item key={p.id} value={`page ${p.name}`} icon={<Globe size={16} />} onSelect={() => go(`/dashboard/status-pages/${p.id}`)}>
                {p.name}
              </Item>
            ))}
          </Command.Group>
        )}

        {data.incidents.length > 0 && (
          <Command.Group heading="Incidents" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-dim">
            {data.incidents.map((i) => (
              <Item key={i.id} value={`incident ${i.label} ${i.title}`} icon={<AlertTriangle size={16} />} hint={`#${i.label}`} onSelect={() => go(`/dashboard/incidents/${i.id}`)}>
                {i.title}
              </Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Appearance" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-dim">
          <Item icon={<Sun size={16} />} onSelect={() => { setTheme("light"); onOpenChange(false); }}>
            Light theme
          </Item>
          <Item icon={<Moon size={16} />} onSelect={() => { setTheme("dark"); onOpenChange(false); }}>
            Dark theme
          </Item>
          <Item icon={<Monitor size={16} />} onSelect={() => { setTheme("system"); onOpenChange(false); }}>
            System theme
          </Item>
        </Command.Group>

        <Command.Group heading="Account" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-dim">
          <Item icon={<LogOut size={16} />} onSelect={logout}>
            Sign out
          </Item>
        </Command.Group>
      </Command.List>
      <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-dim">
        <span className="flex items-center gap-1"><CornerDownLeft size={12} /> select</span>
        <span>↑↓ navigate</span>
      </div>
    </Command.Dialog>
  );
}
