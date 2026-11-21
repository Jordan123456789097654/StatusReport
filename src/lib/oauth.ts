import type { OAuthProvider } from "./env";

type Profile = { id: string; email: string | null; name: string | null; avatar: string | null; discordId?: string };

export const OAUTH: Record<OAuthProvider, { authorize: string; token: string; scope: string; profile: (token: string) => Promise<Profile> }> = {
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    async profile(token) {
      const h = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "StatusReport" };
      const u = await (await fetch("https://api.github.com/user", { headers: h })).json();
      let email: string | null = u.email;
      if (!email) {
        const emails = (await (await fetch("https://api.github.com/user/emails", { headers: h })).json()) as { email: string; primary: boolean; verified: boolean }[];
        email = emails.find((e) => e.primary && e.verified)?.email ?? null;
      }
      return { id: String(u.id), email, name: u.name || u.login, avatar: u.avatar_url };
    },
  },
  discord: {
    authorize: "https://discord.com/oauth2/authorize",
    token: "https://discord.com/api/oauth2/token",
    scope: "identify email",
    async profile(token) {
      const u = await (await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${token}` } })).json();
      return {
        id: String(u.id),
        email: u.verified ? u.email : null,
        name: u.global_name || u.username,
        avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : null,
        discordId: String(u.id),
      };
    },
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    async profile(token) {
      const u = await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token}` } })).json();
      return { id: String(u.sub), email: u.email_verified ? u.email : null, name: u.name, avatar: u.picture };
    },
  },
};
