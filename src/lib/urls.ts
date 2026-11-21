import type { StatusPage } from "@prisma/client";
import { env } from "./env";
import { sign } from "./crypto";

/** Public base URL of a status page: its verified custom domain, or /s/{slug} on the app host. */
export function statusPageBase(p: Pick<StatusPage, "slug" | "customDomain" | "domainStatus">): string {
  if (p.customDomain && p.domainStatus === "verified") return `https://${p.customDomain}`;
  return `${env.appUrl}/s/${p.slug}`;
}

export const dashboardIncidentUrl = (id: string) => `${env.appUrl}/dashboard/incidents/${id}`;
export const ackUrl = (id: string) => `${env.appUrl}/ack/${id}?sig=${sign(`ack:${id}`)}`;
export const heartbeatUrl = (token: string) => `${env.appUrl}/api/v1/heartbeat/${token}`;
export const incidentLabel = (prefix: string, n: number) => `${prefix}-${n}`;
