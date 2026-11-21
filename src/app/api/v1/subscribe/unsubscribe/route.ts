import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (token) await db.subscriber.deleteMany({ where: { token } });
  return new Response("<!doctype html><meta charset=utf-8><body style=\"font-family:sans-serif;background:#0B0D12;color:#E6E8EE;display:grid;place-items:center;height:100vh\"><p>You've been unsubscribed.</p></body>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
