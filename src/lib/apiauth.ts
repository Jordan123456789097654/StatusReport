// Scoped API keys for the REST API: `Authorization: Bearer sr_live_…`
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { clientIp, rateLimit } from "./ratelimit";

export { API_SCOPES } from "./roles";

export function generateApiKey() {
  const key = `sr_live_${randomToken(28)}`;
  return { key, prefix: key.slice(0, 14), hash: sha256(key) };
}

export type ApiCtx = { workspaceId: string; keyId: string; keyName: string };

export async function authenticateApi(req: Request, scope: "read" | "write" | "deployments"): Promise<ApiCtx | Response> {
  const ip = clientIp(req.headers);
  const rl = await rateLimit(`api:${ip}`, 600, 60_000);
  if (!rl.ok) return Response.json({ error: "Rate limit exceeded" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("sr_")) return Response.json({ error: "Missing or malformed API key" }, { status: 401 });
  const key = await db.apiKey.findUnique({ where: { hash: sha256(token) } });
  if (!key) return Response.json({ error: "Invalid API key" }, { status: 401 });
  const scopes = key.scopes.split(",");
  const allowed = scopes.includes(scope) || (scope === "read" && scopes.includes("write"));
  if (!allowed) return Response.json({ error: `API key lacks the "${scope}" scope` }, { status: 403 });
  void db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { workspaceId: key.workspaceId, keyId: key.id, keyName: key.name };
}

export const isResponse = (v: unknown): v is Response => v instanceof Response;
