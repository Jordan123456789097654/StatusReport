// Small FormData helpers for server actions.
import { redirect } from "next/navigation";

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const num = (fd: FormData, k: string, d: number) => {
  const v = Number(fd.get(k));
  return Number.isFinite(v) && String(fd.get(k) ?? "") !== "" ? v : d;
};
export const optNum = (fd: FormData, k: string) => {
  const raw = str(fd, k);
  if (!raw) return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
};
export const bool = (fd: FormData, k: string) => ["on", "true", "1"].includes(String(fd.get(k)));
export const list = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);

/** Redirect back with a flash message (rendered by <Flash/>). */
export function flash(path: string, message: string, kind: "error" | "ok" = "error"): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}
