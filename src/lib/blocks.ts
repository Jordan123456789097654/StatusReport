// Page-builder block definitions for public status pages.
export type BlockType =
  | "hero"
  | "status-banner"
  | "maintenance"
  | "active-incidents"
  | "components"
  | "incident-history"
  | "subscribe"
  | "custom-html";

export type Block = { id: string; type: BlockType; enabled: boolean; title?: string; html?: string };

export const BLOCK_LIBRARY: { type: BlockType; label: string; description: string }[] = [
  { type: "hero", label: "Hero header", description: "Logo, page name and description" },
  { type: "status-banner", label: "Overall status banner", description: "\"All systems operational\" with a glowing dot" },
  { type: "maintenance", label: "Scheduled maintenance", description: "Upcoming and in-progress windows" },
  { type: "active-incidents", label: "Active incidents", description: "Ongoing incidents with their latest update" },
  { type: "components", label: "Components & uptime bars", description: "Collapsible groups, 30/60/90-day history and latency charts" },
  { type: "incident-history", label: "Incident history", description: "Chronological timeline of past incidents" },
  { type: "subscribe", label: "Subscribe", description: "Email / webhook / Discord / RSS subscription" },
  { type: "custom-html", label: "Custom HTML", description: "Any HTML (runs on custom domains only)" },
];

export const DEFAULT_BLOCKS: Block[] = [
  { id: "hero", type: "hero", enabled: true },
  { id: "banner", type: "status-banner", enabled: true },
  { id: "maint", type: "maintenance", enabled: true },
  { id: "active", type: "active-incidents", enabled: true },
  { id: "components", type: "components", enabled: true },
  { id: "history", type: "incident-history", enabled: true },
  { id: "subscribe", type: "subscribe", enabled: true },
];

export function resolveBlocks(stored: Block[] | null | undefined): Block[] {
  if (!stored || !stored.length) return DEFAULT_BLOCKS;
  return stored.filter((b) => BLOCK_LIBRARY.some((l) => l.type === b.type));
}

export type BarConfig = {
  days: 30 | 60 | 90;
  height: number;
  gap: number;
  radius: number;
  upThreshold: number; // ≥ this % → up colour
  degradedThreshold: number; // ≥ this % → degraded colour, below → down colour
  tooltip: string; // {date} {uptime} {incidents}
};

export const DEFAULT_BAR_CONFIG: BarConfig = {
  days: 90,
  height: 34,
  gap: 2,
  radius: 2,
  upThreshold: 99.9,
  degradedThreshold: 99,
  tooltip: "{date} · {uptime} uptime · {incidents} incident(s)",
};

export const resolveBarConfig = (c: Partial<BarConfig> | null | undefined): BarConfig => {
  const merged = { ...DEFAULT_BAR_CONFIG, ...(c || {}) };
  if (![30, 60, 90].includes(Number(merged.days))) merged.days = 90;
  merged.days = Number(merged.days) as BarConfig["days"];
  return merged;
};
