import { db } from "./db";

/** Append-only audit trail. Failures are logged, never thrown, so auditing can't break a request. */
export async function audit(entry: {
  workspaceId?: string | null;
  userId?: string | null;
  actor?: string | null;
  action: string;
  target?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}) {
  try {
    await db.auditLog.create({
      data: {
        workspaceId: entry.workspaceId ?? null,
        userId: entry.userId ?? null,
        actor: entry.actor ?? null,
        action: entry.action,
        target: entry.target ?? null,
        meta: JSON.stringify(entry.meta ?? {}),
        ip: entry.ip ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}
