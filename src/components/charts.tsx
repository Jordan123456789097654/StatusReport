"use client";

import { useMemo, useRef, useState } from "react";
import type { BarConfig } from "@/lib/blocks";
import type { DayBar, LatencyPoint } from "@/lib/statuspage";

const BAR_COLOR: Record<DayBar["status"], string> = {
  up: "var(--sr-up, #22C55E)",
  degraded: "var(--sr-degraded, #F59E0B)",
  down: "var(--sr-down, #EF4444)",
  nodata: "var(--sr-nodata, #2A2F3D)",
};

export function UptimeBars({
  bars,
  config,
  labels = { uptime: "uptime", noData: "No data", today: "Today", daysAgo: "days ago" },
}: {
  bars: DayBar[];
  config: Pick<BarConfig, "height" | "gap" | "radius" | "tooltip">;
  labels?: { uptime: string; noData: string; today: string; daysAgo: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const h = bars[hover ?? -1];
  const tooltip = h
    ? config.tooltip
        .replace("{date}", new Date(h.day + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }))
        .replace("{uptime}", h.uptime == null ? labels.noData : `${(Math.floor(h.uptime * 100) / 100).toFixed(2)}%`)
        .replace("{incidents}", String(h.incidents))
    : "";
  return (
    <div className="relative">
      <div className="flex w-full items-end" style={{ gap: config.gap, height: config.height }} onMouseLeave={() => setHover(null)}>
        {bars.map((b, i) => (
          <div
            key={b.day}
            onMouseEnter={() => setHover(i)}
            className="sr-bar h-full min-w-0 flex-1 cursor-pointer transition-opacity"
            style={{ background: BAR_COLOR[b.status], borderRadius: config.radius, opacity: hover === null || hover === i ? 1 : 0.55, animationDelay: `${Math.min(i * 5, 450)}ms` }}
          />
        ))}
      </div>
      {h && (
        <div
          className="pointer-events-none absolute bottom-full z-20 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: `${((hover! + 0.5) / bars.length) * 100}%`,
            background: "var(--sr-surface, #13161F)",
            borderColor: "var(--sr-border, rgba(255,255,255,.12))",
            color: "var(--sr-text, #E6E8EE)",
          }}
        >
          {tooltip}
        </div>
      )}
      <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: "var(--sr-muted, #8B90A0)" }}>
        <span>
          {bars.length} {labels.daysAgo}
        </span>
        <span>{labels.today}</span>
      </div>
    </div>
  );
}

export function LatencyChart({
  points,
  deployments = [],
  height = 120,
  color = "var(--sr-accent, #22C55E)",
  unit = "ms",
}: {
  points: LatencyPoint[];
  deployments?: { t: number; label: string }[];
  height?: number;
  color?: string;
  unit?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const pad = 6;
  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const max = Math.max(...points.map((p) => p.v)) * 1.15 || 1;
    const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W;
    const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    return { x, y, line, area: `${line} L${W},${H} L0,${H} Z`, t0, t1, max };
  }, [points, H]);

  if (!geo) {
    return (
      <div className="flex items-center justify-center rounded-lg text-xs" style={{ height, color: "var(--sr-muted, #8B90A0)" }}>
        Not enough data yet
      </div>
    );
  }
  const hp = hover != null ? points[hover] : null;
  const gid = `g${Math.round(geo.t0 % 100000)}`;
  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          const t = geo.t0 + ((e.clientX - r.left) / r.width) * (geo.t1 - geo.t0);
          let best = 0;
          for (let i = 1; i < points.length; i++) if (Math.abs(points[i].t - t) < Math.abs(points[best].t - t)) best = i;
          setHover(best);
        }}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={geo.area} fill={`url(#${gid})`} />
        <path d={geo.line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        {deployments
          .filter((d) => d.t >= geo.t0 && d.t <= geo.t1)
          .map((d) => (
            <g key={d.t}>
              <line x1={geo.x(d.t)} x2={geo.x(d.t)} y1={0} y2={H} stroke="#7C83FF" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              <title>{`Deploy ${d.label}`}</title>
            </g>
          ))}
        {hp && <line x1={geo.x(hp.t)} x2={geo.x(hp.t)} y1={0} y2={H} stroke="currentColor" strokeOpacity="0.25" vectorEffect="non-scaling-stroke" />}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border px-2 py-1 text-xs"
          style={{
            left: `${(geo.x(hp.t) / W) * 100}%`,
            background: "var(--sr-surface, #13161F)",
            borderColor: "var(--sr-border, rgba(255,255,255,.12))",
            color: "var(--sr-text, #E6E8EE)",
          }}
        >
          <span className="font-semibold tabular-nums">
            {hp.v}
            {unit}
          </span>{" "}
          <span style={{ color: "var(--sr-muted, #8B90A0)" }}>{new Date(hp.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      )}
    </div>
  );
}
