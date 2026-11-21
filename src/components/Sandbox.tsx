"use client";

// Landing-page sandbox: test-drive the status page and simulate an outage, no sign-up needed.
import { useMemo, useState } from "react";
import { Button, Pill, cx } from "./ui";
import { StatusPageView } from "./StatusPageView";
import { DiscordPreview } from "./DiscordPreview";
import { buildDiscordPayload, DEFAULT_DISCORD_TEMPLATES } from "@/lib/notify/discord";
import { sampleContext } from "@/lib/notify/context";
import type { ComponentStatus, PageConfig, ViewData } from "@/lib/statuspage";
import { sampleConfig } from "@/lib/sample";
import { THEMES } from "@/lib/themes";

export function Sandbox({ data, appUrl }: { data: ViewData; appUrl: string }) {
  const [theme, setTheme] = useState("betterstack-dark");
  const [outage, setOutage] = useState(false);
  const config: PageConfig = useMemo(() => sampleConfig(theme), [theme]);
  const view: ViewData = useMemo(() => {
    if (!outage) return data;
    const status: ComponentStatus = "major";
    const sections = data.sections.map((s) => ({
      ...s,
      status,
      components: s.components.map((c, i) => (i === 0 ? { ...c, status, uptime: 97.4 } : c)),
    }));
    return {
      ...data,
      overall: status,
      sections,
      activeIncidents: [
        {
          id: "sim",
          number: 42,
          label: "ACME-42",
          title: "API is returning errors",
          status: "investigating",
          severity: "major",
          startedAt: new Date().toISOString(),
          resolvedAt: null,
          affected: ["API"],
          updates: [{ status: "investigating", html: "<p>We're investigating elevated 5xx error rates on the API. <strong>Simulated outage.</strong></p>", createdAt: new Date().toISOString() }],
          postmortemHtml: null,
        },
      ],
    };
  }, [data, outage]);

  const payload = useMemo(
    () => buildDiscordPayload(DEFAULT_DISCORD_TEMPLATES.public, "public", outage ? "down" : "up", sampleContext(outage ? "down" : "up", appUrl)),
    [outage, appUrl],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(THEMES).map(([k, t]) => (
              <button
                key={k}
                onClick={() => setTheme(k)}
                className={cx("cursor-pointer rounded-md border px-2.5 py-1 text-xs", theme === k ? "border-up/60 bg-up/10 text-fg" : "border-line-strong text-muted hover:text-fg")}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button variant={outage ? "secondary" : "danger"} onClick={() => setOutage(!outage)}>
            {outage ? "Resolve simulated outage" : "Simulate outage"}
          </Button>
        </div>
        <div className="max-h-[720px] overflow-y-auto sr-scroll">
          <StatusPageView data={view} config={config} allowCustomHtml={false} preview />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">Discord alert</span>
          <Pill status={outage ? "down" : "up"}>{outage ? "down" : "recovered"}</Pill>
        </div>
        <DiscordPreview payload={payload} />
        <p className="text-xs text-dim">Public embeds stay minimal. Private ops embeds add latency, response snippets and on-call pings.</p>
      </div>
    </div>
  );
}
