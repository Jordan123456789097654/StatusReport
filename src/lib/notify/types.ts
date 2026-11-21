export type NotifyKind = "down" | "up" | "update" | "grouped" | "maintenance" | "expiry" | "test";

/** Channel event subscription names (AlertChannel.events). */
export const KIND_TO_EVENT: Record<NotifyKind, string> = {
  down: "down",
  grouped: "down",
  up: "up",
  update: "update",
  maintenance: "maintenance",
  expiry: "expiry",
  test: "test",
};

export const CHANNEL_EVENTS = [
  { value: "down", label: "Monitor down / incident created" },
  { value: "up", label: "Recovered / incident resolved" },
  { value: "update", label: "Incident timeline updates" },
  { value: "maintenance", label: "Scheduled maintenance" },
  { value: "expiry", label: "SSL & domain expiry" },
];

export const CHANNEL_TYPES = [
  { value: "discord", label: "Discord webhook" },
  { value: "slack", label: "Slack incoming webhook" },
  { value: "telegram", label: "Telegram bot" },
  { value: "teams", label: "Microsoft Teams webhook" },
  { value: "email", label: "Email (SMTP / Resend)" },
  { value: "webhook", label: "Generic JSON webhook" },
] as const;

/** Everything a template can reference. Missing pieces are empty strings. */
export type NotifyContext = {
  kind: NotifyKind;
  workspace: { name: string };
  incident: {
    id: string;
    number: number | string;
    title: string;
    status: string;
    severity: string;
    url: string;
    dashboard_url: string;
    ack_url: string;
    started_at: string;
  };
  monitor: { name: string; url: string; method: string; protocol: string; type: string };
  error: { message: string };
  status_page: { url: string; name: string };
  duration: string;
  region: string;
  update: { status: string; message: string };
  latency: { total: number | string; dns: number | string; tcp: number | string; tls: number | string; ttfb: number | string };
  response: { status_code: number | string; snippet: string };
  resolved_ip: string;
  escalation: { tier: number | string };
  oncall: { mention: string };
  maintenance: { title: string; description: string; starts_at: string; ends_at: string };
  expiry: { days: number | string; kind: string; date: string };
};

export type SendResult = { ok: boolean; error?: string };
