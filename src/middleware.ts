// Host-based router.
//  • statusreport.roleflow.site (and APP_HOSTS, localhost) → the main platform.
//  • Any other Host → a customer's custom domain (CNAME → statuspage.statusreport.roleflow.site).
//    The request is rewritten to /s/@{host}{path}; the page looks up the *verified* domain.
//
// The x-sr-domain header is set only here, after stripping any client-supplied copy, so pages can
// trust it to decide whether custom JS/HTML may run (it only runs on the customer's own origin).
import { NextResponse, type NextRequest } from "next/server";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const APP_HOSTS = new Set(
  [
    new URL(appUrl).hostname,
    "localhost",
    "127.0.0.1",
    "[::1]",
    // The production address and Vercel's own deployment URLs always count as the app, never as a customer domain.
    "statusreport.roleflow.site",
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ...(process.env.APP_HOSTS || "").split(","),
  ]
    .filter((h): h is string => Boolean(h))
    .map((h) => h.trim().toLowerCase().replace(/:\d+$/, ""))
    .filter(Boolean),
);
const TRUST_PROXY = process.env.TRUST_PROXY !== "false";

// Paths served as-is on custom domains (the status page's own client calls & assets).
const PASSTHROUGH = ["/_next/", "/api/v1/subscribe", "/api/v1/report-issue", "/widget.js", "/badge/", "/favicon.ico"];

export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.delete("x-sr-domain");

  const forwarded = TRUST_PROXY ? req.headers.get("x-forwarded-host") : null;
  const host = (forwarded || req.headers.get("host") || "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  const { pathname } = req.nextUrl;

  if (!host || APP_HOSTS.has(host)) {
    // The internal custom-domain namespace is not reachable from the app host.
    if (/^\/s\/(@|%40)/i.test(pathname)) return new NextResponse("Not found", { status: 404 });
    return NextResponse.next({ request: { headers } });
  }

  if (PASSTHROUGH.some((p) => pathname.startsWith(p))) return NextResponse.next({ request: { headers } });

  let sub = pathname === "/" ? "" : pathname;
  if (sub === "/api/v1/status.json") sub = "/status.json";
  const url = req.nextUrl.clone();
  url.pathname = `/s/@${host}${sub}`;
  headers.set("x-sr-domain", host);
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
