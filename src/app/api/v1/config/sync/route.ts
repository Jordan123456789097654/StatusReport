// Infrastructure-as-code: POST a YAML or JSON document describing your monitors.
// Monitors are matched by name; `?prune=true` deletes monitors missing from the document.
//
//   monitors:
//     - name: API
//       type: http
//       target: https://api.example.com/health
//       intervalSec: 30
//     - name: Postgres
//       type: tcp
//       target: db.example.com:5432
import YAML from "yaml";
import { authenticateApi, isResponse } from "@/lib/apiauth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { parseMonitorInput } from "@/lib/monitorinput";
import { heartbeatUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await authenticateApi(req, "write");
  if (isResponse(ctx)) return ctx;
  const text = await req.text();
  let doc: { monitors?: Record<string, unknown>[] };
  try {
    doc = (req.headers.get("content-type") || "").includes("json") ? JSON.parse(text) : YAML.parse(text);
  } catch (e) {
    return Response.json({ error: `Could not parse document: ${(e as Error).message}` }, { status: 400 });
  }
  if (!doc || !Array.isArray(doc.monitors)) return Response.json({ error: "Document must contain a `monitors` list" }, { status: 422 });

  const errors: string[] = [];
  const parsed = doc.monitors.map((m, i) => {
    const r = parseMonitorInput(m);
    if ("error" in r) errors.push(`monitors[${i}] (${String(m.name ?? "?")}): ${r.error}`);
    return r;
  });
  if (errors.length) return Response.json({ error: "Validation failed", details: errors }, { status: 422 });

  const names = new Set<string>();
  const result = { created: [] as string[], updated: [] as string[], deleted: [] as string[], heartbeats: {} as Record<string, string> };
  const existing = await db.monitor.findMany({ where: { workspaceId: ctx.workspaceId } });
  for (const p of parsed) {
    if ("error" in p) continue;
    const name = String(p.data.name);
    if (names.has(name)) return Response.json({ error: `Duplicate monitor name "${name}"` }, { status: 422 });
    names.add(name);
    const found = existing.find((m) => m.name === name);
    if (found) {
      const m = await db.monitor.update({ where: { id: found.id }, data: p.data });
      result.updated.push(name);
      if (m.heartbeatToken) result.heartbeats[name] = heartbeatUrl(m.heartbeatToken);
    } else {
      const m = await db.monitor.create({ data: { ...p.data, workspaceId: ctx.workspaceId, heartbeatToken: p.data.type === "heartbeat" ? randomToken(18) : null } });
      result.created.push(name);
      if (m.heartbeatToken) result.heartbeats[name] = heartbeatUrl(m.heartbeatToken);
    }
  }
  if (new URL(req.url).searchParams.get("prune") === "true") {
    const stale = existing.filter((m) => !names.has(m.name));
    await db.monitor.deleteMany({ where: { id: { in: stale.map((m) => m.id) } } });
    result.deleted = stale.map((m) => m.name);
  }
  await audit({ workspaceId: ctx.workspaceId, actor: `api-key:${ctx.keyName}`, action: "config.sync", meta: { created: result.created.length, updated: result.updated.length, deleted: result.deleted.length } });
  return Response.json(result);
}
