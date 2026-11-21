// Start an OAuth flow (GitHub / Discord / Google).
import { cookies } from "next/headers";
import { env, type OAuthProvider } from "@/lib/env";
import { randomToken } from "@/lib/crypto";
import { OAUTH } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = (await params).provider as OAuthProvider;
  const p = OAUTH[provider];
  const creds = env.oauth[provider];
  if (!p || !creds?.id) return new Response("OAuth provider not configured", { status: 404 });
  const state = randomToken(18);
  (await cookies()).set(`sr_oauth_${provider}`, state, { httpOnly: true, sameSite: "lax", secure: env.appUrl.startsWith("https://"), path: "/", maxAge: 600 });
  const url = new URL(p.authorize);
  url.searchParams.set("client_id", creds.id);
  url.searchParams.set("redirect_uri", `${env.appUrl}/api/auth/oauth/${provider}/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", p.scope);
  url.searchParams.set("state", state);
  return Response.redirect(url.toString(), 302);
}
