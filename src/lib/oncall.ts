import type { OnCallSchedule, User } from "@prisma/client";
import { db, json } from "./db";

export type EscalationStep = { delayMin: number; channelIds: string[]; scheduleId?: string | null };

/** Who is on call right now for a rotation schedule. */
export function currentOnCallId(s: Pick<OnCallSchedule, "memberIds" | "rotationHours" | "startsAt">, at = Date.now()): string | null {
  const members = json<string[]>(s.memberIds, []);
  if (!members.length) return null;
  const elapsed = Math.max(0, at - new Date(s.startsAt).getTime());
  const idx = Math.floor(elapsed / (Math.max(1, s.rotationHours) * 3_600_000)) % members.length;
  return members[idx];
}

export function mentionFor(u: Pick<User, "discordUserId" | "name" | "email"> | null | undefined): string {
  if (!u) return "";
  return u.discordUserId ? `<@${u.discordUserId}>` : u.name || u.email;
}

export async function onCallMention(scheduleId: string | null | undefined): Promise<{ mention: string; email?: string }> {
  if (!scheduleId) return { mention: "" };
  const s = await db.onCallSchedule.findUnique({ where: { id: scheduleId } });
  if (!s) return { mention: "" };
  const uid = currentOnCallId(s);
  if (!uid) return { mention: "" };
  const u = await db.user.findUnique({ where: { id: uid } });
  return { mention: mentionFor(u), email: u?.email };
}
