"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

/** Three-way segmented toggle. Renders a placeholder until mounted to avoid a hydration mismatch. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex items-center gap-0.5 rounded-full border border-line-strong bg-card p-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`flex cursor-pointer items-center justify-center rounded-full transition-colors ${compact ? "h-6 w-6" : "h-7 w-7"} ${active ? "bg-fg text-bg" : "text-muted hover:text-fg"}`}
          >
            <Icon size={compact ? 12 : 14} />
          </button>
        );
      })}
    </div>
  );
}
