"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireWorkspace } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { db } from "@/lib/db";
import { flash, str } from "@/lib/forms";
import { parseMonitorInput } from "@/lib/monitorinput";
import { recordResult } from "@/lib/monitoring/engine";
import { runCheck } from "@/lib/monitoring/runner";

const FIELDS = [
  "name", "type", "target", "method", "headers", "body", "bodyType", "authType", "authValue", "expectedStatus", "followRedirects",
  "keyword", "keywordMode", "jsonPath", "jsonOp", "jsonExpected", "port", "udpPayload", "dnsRecordType", "dnsExpected", "sslThresholds",
  "intervalSec", "timeoutMs", "regions", "confirmations", "confirmRegions", "degradedThresholdMs", "heartbeatGraceSec", "escalationPolicyId",
];

export async function saveMonitor(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = str(fd, "id");
  const raw: Record<string, unknown> = {};
  for (const f of FIELDS) raw[f] = fd.get(f) ?? "";
  raw.followRedirects = fd.get("followRedirects") === "on";
  // Keep a stored secret when the field is left blank on edit.
  if (id && !str(fd, "authValue")) delete raw.authValue;
  const back = id ? `/dashboard/monitors/${id}/edit` : `/dashboard/monitors/new?type=${encodeURIComponent(str(fd, "type"))}`;
  const parsed = parseMonitorInput(raw, Boolean(id));
  if ("error" in parsed) flash(back, parsed.error);
  const data = parsed.data;
  if (data.escalationPolicyId && !(await db.escalationPolicy.findFirst({ where: { id: data.escalationPolicyId, workspaceId: ctx.workspace.id } }))) {
    data.escalationPolicyId = null;
  }

  let monitorId = id;
  if (id) {
    const existing = await db.monitor.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
    if (!existing) flash("/dashboard/monitors", "Monitor not found");
    await db.monitor.update({
      where: { id },
      data: { ...data, heartbeatToken: data.type === "heartbeat" ? existing.heartbeatToken || randomToken(18) : existing.heartbeatToken },
    });
    await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "monitor.update", target: id, meta: { name: data.name } });
  } else {
    const m = await db.monitor.create({
      data: { ...data, workspaceId: ctx.workspace.id, heartbeatToken: data.type === "heartbeat" ? randomToken(18) : null },
    });
    monitorId = m.id;
    await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "monitor.create", target: m.id, meta: { name: m.name, type: m.type } });
  }
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/monitors/${monitorId}`);
}

export async function deleteMonitor(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = str(fd, "id");
  const m = await db.monitor.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (m) {
    await db.monitor.delete({ where: { id } });
    await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "monitor.delete", target: id, meta: { name: m.name } });
  }
  revalidatePath("/dashboard", "layout");
  redirect(m?.type === "heartbeat" ? "/dashboard/heartbeats" : "/dashboard/monitors");
}

export async function togglePause(fd: FormData) {
  const ctx = await requireWorkspace("responder");
  const id = str(fd, "id");
  const m = await db.monitor.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!m) return;
  await db.monitor.update({
    where: { id },
    data: m.paused ? { paused: false, status: "pending", lastHeartbeatAt: m.type === "heartbeat" ? new Date() : m.lastHeartbeatAt } : { paused: true, status: "paused" },
  });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: m.paused ? "monitor.resume" : "monitor.pause", target: id });
  revalidatePath(`/dashboard/monitors/${id}`);
  revalidatePath("/dashboard/monitors");
}

export async function checkNow(fd: FormData) {
  const ctx = await requireWorkspace("responder");
  const id = str(fd, "id");
  const m = await db.monitor.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!m || m.type === "heartbeat") return;
  const outcome = await runCheck(m);
  await recordResult(m, "dashboard", outcome);
  revalidatePath(`/dashboard/monitors/${id}`);
}
