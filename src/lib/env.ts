// Central, typed access to environment configuration. Safe to import from the worker.
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === "" ? d : v === "true" || v === "1");

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL ? "https://statusreport.roleflow.site" : "http://localhost:3000")).replace(/\/+$/, "");

export const env = {
  appUrl,
  appHost: new URL(appUrl).host.toLowerCase(),
  extraAppHosts: (process.env.APP_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),
  cnameTarget: (process.env.CNAME_TARGET || "statuspage.statusreport.roleflow.site").toLowerCase(),
  secret: process.env.AUTH_SECRET || "dev-insecure-secret-change-me",
  saasMode: bool(process.env.SAAS_MODE, true),
  allowCustomJsOnAppHost: bool(process.env.ALLOW_CUSTOM_JS_ON_APP_HOST, false),
  blockPrivateTargets: bool(process.env.BLOCK_PRIVATE_TARGETS, true),
  trustProxy: bool(process.env.TRUST_PROXY, true),
  region: process.env.WORKER_REGION || "local",
  concurrency: Number(process.env.WORKER_CONCURRENCY || 25),
  retentionDays: Number(process.env.RETENTION_DAYS || 7),
  emailFrom: process.env.EMAIL_FROM || "StatusReport <alerts@localhost>",
  smtpUrl: process.env.SMTP_URL || "",
  resendKey: process.env.RESEND_API_KEY || "",
  oauth: {
    github: { id: process.env.GITHUB_CLIENT_ID || "", secret: process.env.GITHUB_CLIENT_SECRET || "" },
    discord: { id: process.env.DISCORD_CLIENT_ID || "", secret: process.env.DISCORD_CLIENT_SECRET || "" },
    google: { id: process.env.GOOGLE_CLIENT_ID || "", secret: process.env.GOOGLE_CLIENT_SECRET || "" },
  },
};

export type OAuthProvider = keyof typeof env.oauth;
