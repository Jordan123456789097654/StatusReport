export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "never";
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 5_000) return "just now";
  return `${formatDuration(diff)} ago`;
}

/** Truncating (not rounding) percentage so 99.9996% never shows as 100%. */
export const pct = (n: number | null | undefined, digits = 3) =>
  n == null ? "—" : `${(Math.floor(n * 10 ** digits) / 10 ** digits).toFixed(digits)}%`;

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

export const INTERVALS: { value: number; label: string }[] = [
  { value: 10, label: "10 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 180, label: "3 minutes" },
  { value: 300, label: "5 minutes" },
  { value: 900, label: "15 minutes" },
  { value: 3600, label: "60 minutes" },
];
