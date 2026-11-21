"use client";

import { useState } from "react";
import type { Monitor } from "@prisma/client";
import { MONITOR_TYPES, type MonitorType } from "@/lib/monitoring/types";
import { INTERVALS } from "@/lib/format";
import { Button, Card, CardHeader, Checkbox, Field, Input, Select, Textarea } from "./ui";

const HTTP_TYPES = ["http", "keyword", "json"];

export function MonitorForm({
  monitor,
  initialType,
  policies,
  action,
}: {
  monitor?: Monitor | null;
  initialType?: string;
  policies: { id: string; name: string }[];
  action: (fd: FormData) => void;
}) {
  const [type, setType] = useState<MonitorType>((monitor?.type || initialType || "http") as MonitorType);
  const [method, setMethod] = useState(monitor?.method || "GET");
  const [authType, setAuthType] = useState(monitor?.authType || "none");
  const isHttp = HTTP_TYPES.includes(type);
  const headersText = monitor ? JSON.stringify(JSON.parse(monitor.headers || "{}"), null, 2) : "";

  return (
    <form action={action} className="space-y-6">
      {monitor && <input type="hidden" name="id" value={monitor.id} />}
      <input type="hidden" name="type" value={type} />

      <Card>
        <CardHeader title="What should we monitor?" />
        <div className="grid grid-cols-2 gap-2 p-5 sm:grid-cols-5">
          {MONITOR_TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setType(t.value)}
              title={t.hint}
              className={`cursor-pointer rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                type === t.value ? "border-up/60 bg-up/10 text-fg" : "border-line-strong bg-bg text-muted hover:text-fg"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid gap-5 border-t border-line p-5 sm:grid-cols-2">
          <Field label="Name">
            <Input name="name" required defaultValue={monitor?.name} placeholder="Production API" />
          </Field>
          {type !== "heartbeat" && (
            <Field
              label={isHttp ? "URL" : type === "ssl" || type === "domain" || type === "dns" || type === "ping" ? "Host / domain" : "Host:port"}
              hint={
                isHttp
                  ? "Full URL including https://"
                  : type === "tcp"
                    ? "e.g. db.example.com:5432 (Postgres), redis.internal:6379, mc.example.com:25565"
                    : type === "udp"
                      ? "e.g. game.example.com:27015"
                      : undefined
              }
            >
              <Input
                name="target"
                required
                defaultValue={monitor?.target}
                placeholder={isHttp ? "https://api.example.com/health" : type === "tcp" || type === "udp" ? "db.example.com:5432" : "example.com"}
              />
            </Field>
          )}
          <Field label={type === "heartbeat" ? "Expected every" : "Check frequency"}>
            <Select name="intervalSec" defaultValue={monitor?.intervalSec ?? (type === "heartbeat" ? 3600 : 60)}>
              {(type === "heartbeat"
                ? [
                    { value: 60, label: "1 minute" },
                    { value: 300, label: "5 minutes" },
                    { value: 900, label: "15 minutes" },
                    { value: 3600, label: "1 hour" },
                    { value: 21600, label: "6 hours" },
                    { value: 86400, label: "1 day" },
                    { value: 604800, label: "1 week" },
                  ]
                : INTERVALS
              ).map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </Select>
          </Field>
          {type === "heartbeat" ? (
            <Field label="Grace period (seconds)" hint="How late a check-in may be before we alert">
              <Input name="heartbeatGraceSec" type="number" min={0} defaultValue={monitor?.heartbeatGraceSec ?? 300} />
            </Field>
          ) : (
            <Field label="Timeout (ms)">
              <Input name="timeoutMs" type="number" min={1000} max={60000} defaultValue={monitor?.timeoutMs ?? 10000} />
            </Field>
          )}
        </div>
      </Card>

      {isHttp && (
        <Card>
          <CardHeader title="Request" description="Method, headers, body and authentication" />
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <Field label="Method">
              <Select name="method" value={method} onChange={(e) => setMethod(e.target.value)}>
                {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Expected status codes" hint="Ranges and lists, e.g. 200-299,301">
              <Input name="expectedStatus" defaultValue={monitor?.expectedStatus ?? "200-299"} />
            </Field>
            <Field label="Headers" hint='JSON object or "Header: value" lines' className="sm:col-span-2">
              <Textarea name="headers" rows={3} defaultValue={headersText === "{}" ? "" : headersText} placeholder={'{"X-Api-Key": "…"}'} />
            </Field>
            {!["GET", "HEAD"].includes(method) && (
              <>
                <Field label="Body type">
                  <Select name="bodyType" defaultValue={monitor?.bodyType ?? "json"}>
                    <option value="json">JSON</option>
                    <option value="form">Form (JSON object → urlencoded)</option>
                    <option value="raw">Raw</option>
                  </Select>
                </Field>
                <Field label="Request body" className="sm:col-span-2">
                  <Textarea name="body" rows={4} defaultValue={monitor?.body ?? ""} placeholder='{"ping": true}' />
                </Field>
              </>
            )}
            <Field label="Authentication">
              <Select name="authType" value={authType} onChange={(e) => setAuthType(e.target.value)}>
                <option value="none">None</option>
                <option value="bearer">Bearer token</option>
                <option value="basic">Basic auth</option>
              </Select>
            </Field>
            {authType !== "none" && (
              <Field label={authType === "basic" ? "user:password" : "Token"} hint={monitor?.authValue ? "Leave blank to keep the saved value" : undefined}>
                <Input name="authValue" type="password" autoComplete="off" placeholder={monitor?.authValue ? "••••••••" : ""} />
              </Field>
            )}
            <div className="sm:col-span-2">
              <Checkbox name="followRedirects" label="Follow redirects" defaultChecked={monitor?.followRedirects ?? true} />
            </div>
          </div>
        </Card>
      )}

      {(type === "keyword" || type === "json" || type === "udp") && (
        <Card>
          <CardHeader title="Assertions" />
          <div className="grid gap-5 p-5 sm:grid-cols-3">
            {(type === "keyword" || type === "udp") && (
              <>
                <Field label={type === "udp" ? "Expected reply contains" : "Keyword"} className="sm:col-span-2" hint={type === "udp" ? "Leave empty to only detect ICMP port-unreachable errors" : undefined}>
                  <Input name="keyword" defaultValue={monitor?.keyword ?? ""} required={type === "keyword"} placeholder="healthy" />
                </Field>
                {type === "keyword" ? (
                  <Field label="Alert when the keyword is">
                    <Select name="keywordMode" defaultValue={monitor?.keywordMode ?? "present"}>
                      <option value="present">missing</option>
                      <option value="absent">present</option>
                    </Select>
                  </Field>
                ) : (
                  <Field label="Payload to send">
                    <Input name="udpPayload" defaultValue={monitor?.udpPayload ?? ""} placeholder="\n" />
                  </Field>
                )}
              </>
            )}
            {type === "json" && (
              <>
                <Field label="JSONPath" hint={'Or inline: $.status == "healthy"'}>
                  <Input name="jsonPath" required defaultValue={monitor?.jsonPath ?? ""} placeholder="$.status" className="font-mono" />
                </Field>
                <Field label="Operator">
                  <Select name="jsonOp" defaultValue={monitor?.jsonOp ?? "=="}>
                    {["==", "!=", ">", "<", ">=", "<=", "contains", "exists"].map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Expected value">
                  <Input name="jsonExpected" defaultValue={monitor?.jsonExpected ?? ""} placeholder="healthy" />
                </Field>
              </>
            )}
          </div>
        </Card>
      )}

      {type === "dns" && (
        <Card>
          <CardHeader title="DNS records" description="Alert when records drift from the expected values" />
          <div className="grid gap-5 p-5 sm:grid-cols-3">
            <Field label="Record type">
              <Select name="dnsRecordType" defaultValue={monitor?.dnsRecordType ?? "A"}>
                {["A", "AAAA", "CNAME", "MX", "TXT", "NS"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Expected values" hint="Comma separated; leave empty to only check resolution" className="sm:col-span-2">
              <Input name="dnsExpected" defaultValue={monitor?.dnsExpected ?? ""} placeholder="93.184.216.34" />
            </Field>
          </div>
        </Card>
      )}

      {(type === "ssl" || type === "domain") && (
        <Card>
          <CardHeader title="Expiry alerts" />
          <div className="p-5">
            <Field label="Alert this many days before expiry" hint="Comma separated thresholds">
              <Input name="sslThresholds" defaultValue={monitor?.sslThresholds ?? "30,14,7,1"} />
            </Field>
            {type === "ssl" && <input type="hidden" name="port" value={monitor?.port ?? ""} />}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Alerting & confirmation" description="Avoid false positives with multi-region confirmation" />
        <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {type !== "heartbeat" && (
            <>
              <Field label="Regions" hint="Worker regions, comma separated">
                <Input name="regions" defaultValue={monitor?.regions ?? "local"} />
              </Field>
              <Field label="Consecutive failures (N)">
                <Input name="confirmations" type="number" min={1} max={10} defaultValue={monitor?.confirmations ?? 2} />
              </Field>
              <Field label="…in at least M regions">
                <Input name="confirmRegions" type="number" min={1} max={10} defaultValue={monitor?.confirmRegions ?? 1} />
              </Field>
              {isHttp || type === "tcp" || type === "ping" ? (
                <Field label="Degraded above (ms)" hint="Optional">
                  <Input name="degradedThresholdMs" type="number" min={1} defaultValue={monitor?.degradedThresholdMs ?? ""} />
                </Field>
              ) : (
                <span />
              )}
            </>
          )}
          <Field label="Escalation policy" className="sm:col-span-2">
            <Select name="escalationPolicyId" defaultValue={monitor?.escalationPolicyId ?? ""}>
              <option value="">None: notify every channel immediately</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="primary">{monitor ? "Save changes" : "Create monitor"}</Button>
      </div>
    </form>
  );
}
