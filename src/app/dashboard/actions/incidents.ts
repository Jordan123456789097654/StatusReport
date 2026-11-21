"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { requireWorkspace } from "@/lib/auth";
import { db } from "@/lib/db";
import { bool, flash, list, str } from "@/lib/forms";
import { acknowledgeIncident, createManualIncident, postIncidentUpdate, SEVERITIES } from "@/lib/incidents";

async function ownIncident(id: string, workspaceId: string) {
  const i = await db.incident.findFirst({ where: { id, workspaceId } });
  if (!i) flash("/dashboard/incidents", "Incident not found");
  return i;
}

export async function createIncident(fd: FormData) {
  const ctx = await requireWorkspace("responder");
  const title = str(fd, "title");
  if (!title) flash("/dashboard/incidents/new", "Title is required");
  const i = await createManualIncident(ctx.workspace.id, {
    title,
    message: str(fd, "message"),
    status: str(fd, "status"),
    severity: str(fd, "severity"),
    monitorIds: list(fd, "monitorIds"),
    public: bool(fd, "public"),
    notify: bool(fd, "notify"),
    authorId: ctx.user.id,
  });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "incident.create", target: i.id, meta: { title } });
  redirect(`/dashboard/incidents/${i.id}`);
}

export async function postUpdate(fd: FormData) {
  const ctx = await requireWorkspace("responder");
  const id = str(fd, "id");
  await ownIncident(id, ctx.workspace.id);
  const message = str(fd, "message");
  if (!message) flash(`/dashboard/incidents/${id}`, "Write an update message");
  await postIncidentUpdate(id, { status: str(fd, "status"), message, authorId: ctx.user.id, notify: bool(fd, "notify") });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "incident.update", target: id, meta: { status: str(fd, "status") } });
  revalidatePath(`/dashboard/incidents/${id}`);
}

export async function ackIncident(fd: FormData) {
  const ctx = await requireWorkspace("responder");
  const id = str(fd, "id");
  await ownIncident(id, ctx.workspace.id);
  await acknowledgeIncident(id, ctx.user.name || ctx.user.email);
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "incident.acknowledge", target: id });
  revalidatePath(`/dashboard/incidents/${id}`);
}

export async function updateIncidentMeta(fd: FormData) {
  const ctx = await requireWorkspace("responder");
  const id = str(fd, "id");
  await ownIncident(id, ctx.workspace.id);
  const severity = str(fd, "severity");
  await db.incident.update({
    where: { id },
    data: {
      title: str(fd, "title") || undefined,
      ...(SEVERITIES.some((s) => s.value === severity) ? { severity } : {}),
      public: bool(fd, "public"),
    },
  });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "incident.edit", target: id });
  revalidatePath(`/dashboard/incidents/${id}`);
}

export async function savePostmortem(fd: FormData) {
  const ctx = await requireWorkspace("responder");
  const id = str(fd, "id");
  await ownIncident(id, ctx.workspace.id);
  await db.incident.update({ where: { id }, data: { postmortem: String(fd.get("postmortem") || ""), postmortemPublished: bool(fd, "publish") } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "incident.postmortem", target: id, meta: { published: bool(fd, "publish") } });
  revalidatePath(`/dashboard/incidents/${id}`);
  flash(`/dashboard/incidents/${id}`, bool(fd, "publish") ? "Post-mortem published to the status page" : "Post-mortem saved as draft", "ok");
}

export async function deleteIncident(fd: FormData) {
  const ctx = await requireWorkspace("admin");
  const id = str(fd, "id");
  await db.incident.deleteMany({ where: { id, workspaceId: ctx.workspace.id } });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "incident.delete", target: id });
  redirect("/dashboard/incidents");
}

export async function createMaintenance(fd: FormData) {
  const ctx = await requireWorkspace("responder");
  // datetime-local inputs carry no zone; the form labels them as UTC.
  const utc = (v: string) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}Z`);
  const startsAt = utc(str(fd, "startsAt"));
  const endsAt = utc(str(fd, "endsAt"));
  const back = "/dashboard/incidents/maintenance";
  if (!str(fd, "title")) flash(back, "Title is required");
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) flash(back, "End must be after start");
  const ids = (await db.monitor.findMany({ where: { workspaceId: ctx.workspace.id, id: { in: list(fd, "monitorIds") } }, select: { id: true } })).map((m) => m.id);
  const m = await db.maintenance.create({
    data: {
      workspaceId: ctx.workspace.id,
      title: str(fd, "title"),
      description: str(fd, "description"),
      startsAt,
      endsAt,
      muteAlerts: bool(fd, "muteAlerts"),
      monitorIds: JSON.stringify(ids),
    },
  });
  await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "maintenance.create", target: m.id, meta: { title: m.title } });
  flash(back, "Maintenance window scheduled", "ok");
}

export async function deleteMaintenance(fd: FormData) {
  const ctx = await requireWorkspace("responder");
  const id = str(fd, "id");
  const m = await db.maintenance.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (m) {
    await db.maintenance.delete({ where: { id } });
    const ids = JSON.parse(m.monitorIds || "[]") as string[];
    if (ids.length && m.status === "in_progress") await db.monitor.updateMany({ where: { id: { in: ids } }, data: { inMaintenance: false } });
    await audit({ workspaceId: ctx.workspace.id, userId: ctx.user.id, actor: ctx.user.email, action: "maintenance.delete", target: id });
  }
  revalidatePath("/dashboard/incidents/maintenance");
}

export async function deleteIssueReport(fd: FormData) {
  const ctx = await requireWorkspace("responder");
  const id = str(fd, "id");
  await db.issueReport.deleteMany({ where: { id, statusPage: { workspaceId: ctx.workspace.id } } });
  revalidatePath("/dashboard/incidents");
}
