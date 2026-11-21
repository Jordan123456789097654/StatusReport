"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { unlockCookieName, unlockValue } from "@/lib/publicpage";

export async function unlockPage(formData: FormData) {
  const pageId = String(formData.get("pageId") || "");
  const password = String(formData.get("password") || "");
  const back = String(formData.get("back") || "/");
  const safeBack = back.startsWith("/") && !back.startsWith("//") ? back : "/";
  const ip = clientIp(await headers());
  if (!(await rateLimit(`unlock:${pageId}:${ip}`, 10, 10 * 60_000)).ok) redirect(`${safeBack}?error=Too+many+attempts`);
  const page = await db.statusPage.findUnique({ where: { id: pageId } });
  if (!page || page.visibility !== "password" || !verifyPassword(password, page.passwordHash)) {
    redirect(`${safeBack}?error=Incorrect+password`);
  }
  (await cookies()).set(unlockCookieName(page.id), unlockValue(page), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 86_400 });
  redirect(safeBack);
}
