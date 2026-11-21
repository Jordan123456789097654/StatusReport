"use client";

// Better Stack-style "Custom domain" settings section with live CNAME instructions,
// one-click copy, automatic DNS verification polling and SSL status.
import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, CircleDashed, ExternalLink, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { Button } from "./ui";

type Status = "none" | "pending" | "verified" | "failed";

export function CustomDomainCard({
  pageId,
  initialDomain,
  initialStatus,
  initialDetail,
  cnameTarget,
  save,
  check,
}: {
  pageId: string;
  initialDomain: string;
  initialStatus: Status;
  initialDetail: string | null;
  cnameTarget: string;
  save: (domain: string, pageId: string) => Promise<{ ok: boolean; error?: string; status?: string; detail?: string }>;
  check: (pageId: string) => Promise<{ status: string; detail: string | null; checkedAt: string | null }>;
}) {
  const [domain, setDomain] = useState(initialDomain);
  const [saved, setSaved] = useState(initialDomain);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [detail, setDetail] = useState(initialDetail);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const host = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "status.example.com";

  // Poll DNS every 10s while a saved domain is pending verification.
  useEffect(() => {
    if (!saved || status === "verified" || status === "none") return;
    const t = setInterval(async () => {
      const r = await check(pageId);
      setStatus(r.status as Status);
      setDetail(r.detail);
    }, 10_000);
    return () => clearInterval(t);
  }, [saved, status, check, pageId]);

  const rows = [{ type: "CNAME", host, target: cnameTarget }];

  return (
    <div className="grid gap-8 border-t border-line py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div>
        <h3 className="font-semibold">Custom domain</h3>
        <p className="mt-1 text-sm text-muted">Deploy your status page to a custom subdomain for a branded experience.</p>
        <a href="/docs#custom-domains" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-muted underline-offset-2 hover:text-fg hover:underline">
          How to set up a custom domain <ExternalLink size={12} />
        </a>
      </div>

      <div className="rounded-xl border border-line bg-card">
        <form
          className="p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await save(domain, pageId);
              if (!r.ok) return setError(r.error || "Could not save domain");
              setSaved(domain.trim());
              setStatus((r.status as Status) || "pending");
              setDetail(r.detail || null);
            });
          }}
        >
          <label htmlFor="custom-domain" className="mb-1.5 block text-[13px] font-medium">
            Custom domain
          </label>
          <div className="flex gap-2">
            <input id="custom-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="status.stripe.com" className="sr-input font-mono" autoComplete="off" spellCheck={false} />
            <Button variant="primary" disabled={pending}>
              {pending ? <Loader2 size={15} className="animate-spin" /> : null}
              {saved && !domain.trim() ? "Remove" : "Save"}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-down">{error}</p>}

          <div className="mt-5 rounded-lg border border-line bg-bg">
            <p className="px-4 py-3 text-sm text-muted">
              Please point <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12.5px] text-fg">{host}</code> to StatusReport by configuring the following CNAME records.
            </p>
            <div className="overflow-x-auto border-t border-line sr-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-dim">
                    <th className="px-4 py-2 font-medium">Record Type</th>
                    <th className="px-4 py-2 font-medium">Host</th>
                    <th className="px-4 py-2 font-medium">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.type} className="border-t border-line">
                      <td className="px-4 py-3 font-mono text-[13px]">{r.type}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 font-mono text-[13px]">
                          {r.host} <CopyButton value={r.host} />
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 font-mono text-[13px]">
                          {r.target} <CopyButton value={r.target} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {saved && (
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center gap-2">
                {status === "verified" ? (
                  <>
                    <CheckCircle2 size={16} className="text-up" /> <span>DNS verified: {saved} points to StatusReport.</span>
                  </>
                ) : status === "failed" ? (
                  <>
                    <XCircle size={16} className="text-down" /> <span>Verification lost. Check your DNS records.</span>
                  </>
                ) : (
                  <>
                    <CircleDashed size={16} className="animate-spin text-warn [animation-duration:3s]" /> <span>Waiting for DNS. We re-check automatically every few seconds.</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted">
                <ShieldCheck size={16} className={status === "verified" ? "text-up" : "text-dim"} />
                {status === "verified" ? (
                  <span>
                    SSL certificate is issued automatically on first visit.{" "}
                    <a href={`https://${saved}`} target="_blank" rel="noreferrer" className="text-fg underline underline-offset-2">
                      Open https://{saved}
                    </a>
                  </span>
                ) : (
                  <span>SSL will be provisioned automatically once DNS is verified.</span>
                )}
              </div>
              {detail && status !== "verified" && <p className="pl-6 text-xs text-dim">{detail}</p>}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
