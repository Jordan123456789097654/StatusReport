"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title="Copy to clipboard"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = value;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className={
        className ||
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line-strong bg-card-2 px-2 py-1 text-xs text-muted transition-colors hover:text-fg"
      }
    >
      {done ? <Check size={13} className="text-up" /> : <Copy size={13} />}
      {label && <span>{done ? "Copied" : label}</span>}
    </button>
  );
}

export function CopyField({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line-strong bg-bg px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}
