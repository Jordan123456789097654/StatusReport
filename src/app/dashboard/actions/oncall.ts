"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { flash, list, num, str } from "@/lib/forms";
import type { EscalationStep } from "@/lib/oncall";

const BACK = "/dashboard/on-call";

export async function saveSchedule(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const name = str(fd, "name");
  if (!name) flash(BACK, "Schedule name is required");
  const members = await db.membership.findMany({ where: { workspaceId: ctx.workspace.id } });
  const valid = new Set(members.map((m) => m.userId));
  const order = str(fd, "memberOrder").split(",").map((s) => s.trim()).filter((id) => valid.has(id));
  const memberIds = order.length ? order : list(fd, "memberIds").filter((id) => valid.has(id));
  if (!memberIds.length) flash(BACK, "Pick at least one responder");
  const startsAt = str(fd, "startsAt") ? new Date(str(fd, "startsAt")) : new Date();
  const s = await db.onCallSchedule.create({
    data: { workspaceId: ctx.workspace.id, name, rotationHours: Math.max(1, num(fd, "rotationHours", 168)), startsAt, memberIds: JSON.stringify(memberIds) },
  });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "oncall.schedule.create", target: s.id });
  flash(BACK, "Schedule created", "ok");
}

export async function deleteSchedule(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  await db.onCallSchedule.deleteMany({ where: { id: str(fd, "id"), workspaceId: ctx.workspace.id } });
  revalidatePath(BACK);
}

export async function savePolicy(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const name = str(fd, "name");
  if (!name) flash(BACK, "Policy name is required");
  const channels = new Set((await db.alertChannel.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true } })).map((c) => c.id));
  const schedules = new Set((await db.onCallSchedule.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true } })).map((c) => c.id));
  const steps: EscalationStep[] = [];
  for (let i = 0; i < 4; i++) {
    const channelIds = list(fd, `step${i}_channels`).filter((id) => channels.has(id));
    const scheduleId = str(fd, `step${i}_schedule`);
    if (!channelIds.length) continue;
    steps.push({ delayMin: i === 0 ? 0 : Math.max(1, num(fd, `step${i}_delay`, 10 * i)), channelIds, scheduleId: schedules.has(scheduleId) ? scheduleId : null });
  }
  if (!steps.length) flash(BACK, "Add at least one step with a channel");
  steps.sort((a, b) => a.delayMin - b.delayMin);
  const p = await db.escalationPolicy.create({ data: { workspaceId: ctx.workspace.id, name, steps: JSON.stringify(steps) } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "oncall.policy.create", target: p.id });
  flash(BACK, "Escalation policy created. Attach it to monitors from their settings.", "ok");
}

export async function deletePolicy(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  await db.escalationPolicy.deleteMany({ where: { id: str(fd, "id"), workspaceId: ctx.workspace.id } });
  revalidatePath(BACK);
}
