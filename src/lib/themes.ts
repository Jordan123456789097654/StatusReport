// Status page theme presets + granular design tokens.
export type Tokens = {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  up: string;
  degraded: string;
  down: string;
  maintenance: string;
  nodata: string;
  radius: number;
  font: string;
  shadow: "none" | "sm" | "lg";
  blur: number;
};

const betterstack: Tokens = {
  bg: "#0B0D12",
  surface: "#13161F",
  border: "rgba(255,255,255,0.08)",
  text: "#E6E8EE",
  muted: "#8B90A0",
  accent: "#22C55E",
  up: "#22C55E",
  degraded: "#F59E0B",
  down: "#EF4444",
  maintenance: "#3B82F6",
  nodata: "#2A2F3D",
  radius: 12,
  font: "Inter",
  shadow: "sm",
  blur: 0,
};

export const THEMES: Record<string, { label: string; tokens: Tokens }> = {
  "clean-light": {
    label: "Clean Light",
    tokens: { ...betterstack, bg: "#FAFAF9", surface: "#FFFFFF", border: "rgba(10,10,10,0.08)", text: "#0A0A0A", muted: "#5F5F5A", accent: "#0A0A0A", up: "#16A34A", degraded: "#D97706", down: "#DC2626", maintenance: "#2563EB", nodata: "#E7E7E3", radius: 14, shadow: "sm" },
  },
  "clean-dark": {
    label: "Clean Dark",
    tokens: { ...betterstack, bg: "#09090B", surface: "#111113", border: "rgba(255,255,255,0.08)", text: "#FAFAFA", muted: "#A1A1AA", accent: "#FAFAFA", nodata: "#27272A", radius: 14, shadow: "sm" },
  },
  "betterstack-dark": { label: "Better Stack Dark", tokens: betterstack },
  "minimal-light": {
    label: "Minimalist Light",
    tokens: { ...betterstack, bg: "#F7F8FA", surface: "#FFFFFF", border: "rgba(15,23,42,0.09)", text: "#0F172A", muted: "#64748B", accent: "#16A34A", up: "#16A34A", nodata: "#E2E8F0", shadow: "sm" },
  },
  "midnight-obsidian": {
    label: "Midnight Obsidian",
    tokens: { ...betterstack, bg: "#05060A", surface: "#0C0E16", border: "rgba(124,131,255,0.14)", text: "#E4E6F5", muted: "#7A7F9A", accent: "#7C83FF", nodata: "#1A1D2B", radius: 16, shadow: "lg" },
  },
  glassmorphism: {
    label: "Glassmorphism",
    tokens: { ...betterstack, bg: "#0E1024", surface: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.14)", text: "#F4F5FF", muted: "#A9ADCB", accent: "#A78BFA", nodata: "rgba(255,255,255,0.12)", radius: 18, shadow: "lg", blur: 16 },
  },
  "high-contrast-terminal": {
    label: "High-Contrast Terminal",
    tokens: { ...betterstack, bg: "#000000", surface: "#050505", border: "#1F3D1F", text: "#B6FFB6", muted: "#5FAF5F", accent: "#00FF66", up: "#00FF66", degraded: "#FFD400", down: "#FF3B3B", nodata: "#122012", radius: 0, font: "JetBrains Mono", shadow: "none" },
  },
};

export const FONTS = ["Inter", "JetBrains Mono", "IBM Plex Sans", "Manrope", "DM Sans", "Space Grotesk", "Plus Jakarta Sans", "Roboto", "Source Sans 3", "Outfit"];

export function resolveTokens(theme: string, overrides: Partial<Tokens> | null | undefined): Tokens {
  const base = THEMES[theme]?.tokens || betterstack;
  const clean: Partial<Tokens> = {};
  for (const [k, v] of Object.entries(overrides || {})) if (v !== "" && v != null) (clean as Record<string, unknown>)[k] = v;
  return { ...base, ...clean };
}

const SHADOWS = { none: "none", sm: "0 1px 2px rgba(0,0,0,.06), 0 10px 28px -14px rgba(0,0,0,.22)", lg: "0 2px 4px rgba(0,0,0,.3), 0 24px 60px -20px rgba(0,0,0,.6)" };

/** Strip anything that could break out of a CSS declaration. */
const safe = (v: string) => String(v).replace(/[;{}<>\\]/g, "");

export function tokensToCss(t: Tokens): string {
  return [
    `--sr-bg:${safe(t.bg)}`,
    `--sr-surface:${safe(t.surface)}`,
    `--sr-border:${safe(t.border)}`,
    `--sr-text:${safe(t.text)}`,
    `--sr-muted:${safe(t.muted)}`,
    `--sr-accent:${safe(t.accent)}`,
    `--sr-up:${safe(t.up)}`,
    `--sr-degraded:${safe(t.degraded)}`,
    `--sr-down:${safe(t.down)}`,
    `--sr-maintenance:${safe(t.maintenance)}`,
    `--sr-nodata:${safe(t.nodata)}`,
    `--sr-radius:${Number(t.radius) || 0}px`,
    `--sr-font:"${safe(t.font)}",ui-sans-serif,system-ui,sans-serif`,
    `--sr-shadow:${SHADOWS[t.shadow] || SHADOWS.sm}`,
    `--sr-blur:${Number(t.blur) || 0}px`,
  ].join(";");
}

/** Same tokens as a React style object (CSS custom properties). */
export function tokensToStyle(t: Tokens): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of tokensToCss(t).split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out[decl.slice(0, i)] = decl.slice(i + 1);
  }
  return out;
}

export const googleFontHref = (font: string) =>
  `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
