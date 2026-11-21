// Registers customer custom domains with the Vercel project so Vercel serves them and issues SSL.
// Enabled when VERCEL_API_TOKEN and VERCEL_PROJECT_ID are set; otherwise a no-op (self-hosting with Caddy etc.).
const token = process.env.VERCEL_API_TOKEN;
const projectId = process.env.VERCEL_PROJECT_ID;
const teamId = process.env.VERCEL_TEAM_ID;

export const vercelDomainsEnabled = Boolean(token && projectId);

const qs = () => (teamId ? `?teamId=${encodeURIComponent(teamId)}` : "");
const headers = () => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

type VercelError = { error?: { code?: string; message?: string } };

export async function addProjectDomain(domain: string): Promise<{ ok: boolean; error?: string }> {
  if (!vercelDomainsEnabled) return { ok: true };
  try {
    const res = await fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(projectId!)}/domains${qs()}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ name: domain }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as VercelError;
    // Already attached to this project is fine; attached to another project is not.
    if (res.status === 409 && body.error?.code === "domain_already_in_project") return { ok: true };
    return { ok: false, error: body.error?.message || `Vercel responded ${res.status}` };
  } catch (e) {
    return { ok: false, error: `Could not reach Vercel: ${(e as Error).message}` };
  }
}

export async function removeProjectDomain(domain: string): Promise<void> {
  if (!vercelDomainsEnabled) return;
  try {
    await fetch(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId!)}/domains/${encodeURIComponent(domain)}${qs()}`, {
      method: "DELETE",
      headers: headers(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.warn("[vercel] failed to remove domain", domain, (e as Error).message);
  }
}
