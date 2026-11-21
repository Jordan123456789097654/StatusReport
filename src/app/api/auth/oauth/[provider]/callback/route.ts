import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env, type OAuthProvider } from "@/lib/env";
import { audit } from "@/lib/audit";
import { createSession, createWorkspaceFor } from "@/lib/auth";
import { OAUTH } from "@/lib/oauth";

export const dynamic = "force-dynamic";

const fail = (msg: string) => Response.redirect(`${env.appUrl}/login?error=${encodeURIComponent(msg)}`, 302);

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const provider = (await params).provider as OAuthProvider;
  const p = OAUTH[provider];
  const creds = env.oauth[provider];
  if (!p || !creds?.id) return fail("OAuth provider not configured");

  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get(`sr_oauth_${provider}`)?.value;
  jar.delete(`sr_oauth_${provider}`);
  if (!expected || url.searchParams.get("state") !== expected) return fail("OAuth state mismatch, please try again");
  const code = url.searchParams.get("code");
  if (!code) return fail("Sign-in was cancelled");

  const tokenRes = await fetch(p.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: creds.id,
      client_secret: creds.secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${env.appUrl}/api/auth/oauth/${provider}/callback`,
    }),
  });
  const token = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
  if (!token.access_token) return fail("Could not complete sign-in");
  const profile = await p.profile(token.access_token);
  if (!profile.email) return fail(`Your ${provider} account has no verified email address`);
  const email = profile.email.toLowerCase();

  const account = await db.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId: profile.id } }, include: { user: true } });
  let user = account?.user ?? (await db.user.findUnique({ where: { email } }));
  let isNew = false;
  if (!user) {
    if (!env.saasMode && (await db.user.count()) > 0) return fail("Registration is closed on this instance");
    user = await db.user.create({ data: { email, name: profile.name, avatarUrl: profile.avatar, discordUserId: profile.discordId ?? null } });
    isNew = true;
  }
  if (!account) await db.account.create({ data: { userId: user.id, provider, providerAccountId: profile.id } });
  if (profile.discordId && !user.discordUserId) await db.user.update({ where: { id: user.id }, data: { discordUserId: profile.discordId } });

  let membership = await db.membership.findFirst({ where: { userId: user.id } });
  if (!membership && isNew) {
    const ws = await createWorkspaceFor(user.id, `${profile.name || email.split("@")[0]}'s workspace`);
    membership = await db.membership.findFirst({ where: { userId: user.id, workspaceId: ws.id } });
  }
  await createSession(user.id, { pending2fa: user.totpEnabled, workspaceId: membership?.workspaceId });
  await audit({ workspaceId: membership?.workspaceId, userId: user.id, actor: email, action: "auth.login", meta: { provider } });
  return Response.redirect(`${env.appUrl}${user.totpEnabled ? "/login/2fa" : "/dashboard"}`, 302);
}
