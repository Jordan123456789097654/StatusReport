import { env } from "@/lib/env";

const PROVIDERS = [
  { id: "github", label: "GitHub" },
  { id: "discord", label: "Discord" },
  { id: "google", label: "Google" },
] as const;

export function OAuthButtons() {
  const enabled = PROVIDERS.filter((p) => env.oauth[p.id].id && env.oauth[p.id].secret);
  if (!enabled.length) return null;
  return (
    <>
      <div className="grid gap-2">
        {enabled.map((p) => (
          <a
            key={p.id}
            href={`/api/auth/oauth/${p.id}`}
            className="flex items-center justify-center rounded-lg border border-line-strong bg-card-2 px-3 py-2 text-sm hover:bg-card-3"
          >
            Continue with {p.label}
          </a>
        ))}
      </div>
      <div className="my-5 flex items-center gap-3 text-xs text-dim">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}
