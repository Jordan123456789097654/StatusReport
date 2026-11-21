import { env } from "@/lib/env";

export const dynamic = "force-static";

const json = (schema: object) => ({ "application/json": { schema } });
const ok = (description: string) => ({ description });
const idParam = { name: "id", in: "path", required: true, schema: { type: "string" } };

const Monitor = {
  type: "object",
  properties: {
    name: { type: "string" },
    type: { type: "string", enum: ["http", "keyword", "json", "tcp", "udp", "ping", "dns", "ssl", "domain", "heartbeat"] },
    target: { type: "string", example: "https://api.example.com/health" },
    method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] },
    headers: { type: "object", additionalProperties: { type: "string" } },
    body: { type: "string" },
    authType: { type: "string", enum: ["none", "bearer", "basic"] },
    expectedStatus: { type: "string", example: "200-299" },
    keyword: { type: "string" },
    keywordMode: { type: "string", enum: ["present", "absent"] },
    jsonPath: { type: "string", example: "$.status" },
    jsonOp: { type: "string", example: "==" },
    jsonExpected: { type: "string", example: "healthy" },
    intervalSec: { type: "integer", enum: [10, 30, 60, 180, 300, 900, 3600] },
    timeoutMs: { type: "integer" },
    regions: { type: "string", example: "us-east,eu-west" },
    confirmations: { type: "integer" },
    confirmRegions: { type: "integer" },
    paused: { type: "boolean" },
  },
  required: ["name", "type"],
};

export function GET() {
  const spec = {
    openapi: "3.1.0",
    info: { title: "StatusReport API", version: "1.0.0", description: "Free, open-source uptime monitoring & status pages. Authenticate with `Authorization: Bearer sr_live_…`." },
    servers: [{ url: `${env.appUrl}/api/v1` }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } }, schemas: { Monitor } },
    security: [{ bearer: [] }],
    paths: {
      "/monitors": {
        get: { summary: "List monitors", responses: { 200: ok("Monitors") } },
        post: { summary: "Create a monitor", requestBody: { content: json({ $ref: "#/components/schemas/Monitor" }) }, responses: { 201: ok("Created") } },
      },
      "/monitors/{id}": {
        parameters: [idParam],
        get: { summary: "Get a monitor with recent checks", responses: { 200: ok("Monitor") } },
        patch: { summary: "Update a monitor", requestBody: { content: json({ $ref: "#/components/schemas/Monitor" }) }, responses: { 200: ok("Updated") } },
        delete: { summary: "Delete a monitor", responses: { 204: ok("Deleted") } },
      },
      "/incidents": {
        get: { summary: "List incidents (?status=open)", responses: { 200: ok("Incidents") } },
        post: {
          summary: "Create an incident",
          requestBody: { content: json({ type: "object", properties: { title: { type: "string" }, message: { type: "string" }, status: { type: "string" }, severity: { type: "string" }, monitorIds: { type: "array", items: { type: "string" } }, public: { type: "boolean" } }, required: ["title"] }) },
          responses: { 201: ok("Created") },
        },
      },
      "/incidents/{id}": {
        parameters: [idParam],
        get: { summary: "Get an incident", responses: { 200: ok("Incident") } },
        patch: {
          summary: "Post an update, change severity or acknowledge",
          requestBody: { content: json({ type: "object", properties: { status: { type: "string" }, message: { type: "string" }, severity: { type: "string" }, acknowledge: { type: "boolean" }, notify: { type: "boolean" } } }) },
          responses: { 200: ok("Updated") },
        },
      },
      "/status-pages": { get: { summary: "List status pages", responses: { 200: ok("Pages") } } },
      "/deployments": {
        get: { summary: "List deployment markers", responses: { 200: ok("Deployments") } },
        post: { summary: "Record a deployment marker", requestBody: { content: json({ type: "object", properties: { version: { type: "string" }, environment: { type: "string" }, commitSha: { type: "string" }, url: { type: "string" }, monitorId: { type: "string" } }, required: ["version"] }) }, responses: { 201: ok("Created") } },
      },
      "/config/sync": { post: { summary: "Sync monitors from YAML/JSON (?prune=true)", requestBody: { content: { "application/yaml": { schema: { type: "string" } } } }, responses: { 200: ok("Sync result") } } },
      "/workspace/export": { get: { summary: "Download a full JSON backup", responses: { 200: ok("Backup") } } },
      "/heartbeat/{token}": { parameters: [{ name: "token", in: "path", required: true, schema: { type: "string" } }], get: { summary: "Heartbeat check-in (no auth; ?status=fail to report failure)", security: [], responses: { 200: ok("Recorded") } } },
    },
  };
  return Response.json(spec, { headers: { "access-control-allow-origin": "*" } });
}
