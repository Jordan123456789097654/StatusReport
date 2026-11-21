"use client";

import { useActionState, useState } from "react";
import { Button, Checkbox, Field, Input, Select } from "./ui";
import { CopyField } from "./CopyButton";
import { API_SCOPES, ROLES } from "@/lib/roles";

type Res = { link?: string; error?: string; key?: string } | null;

export function InviteForm({ action }: { action: (prev: Res, fd: FormData) => Promise<Res> }) {
  const [state, formAction, pending] = useActionState<Res, FormData>(action, null);
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <Field label="Email">
          <Input name="email" type="email" required placeholder="teammate@company.com" />
        </Field>
        <Field label="Role">
          <Select name="role" defaultValue="responder">
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button variant="primary" disabled={pending}>
          Create invite
        </Button>
      </div>
      {state?.error && <p className="text-sm text-down">{state.error}</p>}
      {state?.link && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted">Share this link. It expires in 7 days and works once.</p>
          <CopyField value={state.link} />
        </div>
      )}
    </form>
  );
}

export function ApiKeyForm({ action }: { action: (prev: Res, fd: FormData) => Promise<Res> }) {
  const [state, formAction, pending] = useActionState<Res, FormData>(action, null);
  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Key name">
            <Input name="name" required placeholder="GitHub Actions: deploy" />
          </Field>
          <Button variant="primary" disabled={pending}>
            Create key
          </Button>
        </div>
        <div className="flex flex-wrap gap-5">
          {API_SCOPES.map((s) => (
            <Checkbox key={s.value} name="scopes" value={s.value} defaultChecked={s.value === "read"} label={s.label} />
          ))}
        </div>
      </form>
      {state?.error && <p className="text-sm text-down">{state.error}</p>}
      {state?.key && (
        <div className="space-y-1.5 rounded-lg border border-warn/30 bg-warn/10 p-4">
          <p className="text-sm text-warn">Copy this key now. It will not be shown again.</p>
          <CopyField value={state.key} />
        </div>
      )}
    </div>
  );
}

export function TwoFactorSetup({ secret, otpauth, enable }: { secret: string; otpauth: string; enable: (fd: FormData) => void }) {
  const [code, setCode] = useState("");
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Add this key to your authenticator app (Add account → Enter a setup key). The secret never leaves this server.</p>
      <CopyField value={secret} />
      <details className="text-xs text-dim">
        <summary className="cursor-pointer">otpauth URI</summary>
        <div className="mt-2">
          <CopyField value={otpauth} />
        </div>
      </details>
      <form action={enable} className="flex gap-3">
        <Input name="code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" className="max-w-[180px] font-mono tracking-widest" />
        <Button variant="primary">Turn on 2FA</Button>
      </form>
    </div>
  );
}
