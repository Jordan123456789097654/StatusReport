import { Lock, ShieldOff } from "lucide-react";
import type { StatusPage } from "@prisma/client";
import { unlockPage } from "./actions";

export function Gate({ page, mode, back, error }: { page: StatusPage; mode: "password" | "denied"; back: string; error?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-card p-7 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-fg/5">
          {mode === "password" ? <Lock size={18} /> : <ShieldOff size={18} />}
        </div>
        <h1 className="text-lg font-semibold">{page.name}</h1>
        {mode === "password" ? (
          <form action={unlockPage} className="mt-5 space-y-3">
            <p className="text-sm text-muted">This status page is password protected.</p>
            <input type="hidden" name="pageId" value={page.id} />
            <input type="hidden" name="back" value={back} />
            <input name="password" type="password" required autoFocus placeholder="Password" className="sr-input" />
            {error && <p className="text-sm text-down">{error}</p>}
            <button className="w-full cursor-pointer rounded-lg bg-up py-2 text-sm font-semibold text-[#06140b]">Unlock</button>
          </form>
        ) : (
          <p className="mt-3 text-sm text-muted">This status page is private. Sign in with a team account, or access it from an allowed network.</p>
        )}
      </div>
    </div>
  );
}
