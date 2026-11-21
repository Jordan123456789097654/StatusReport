// Optional demo data. Set SEED_EMAIL and SEED_PASSWORD to create an owner account with a
// workspace, two sample monitors and a status page. Does nothing when they are unset.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/crypto";

const db = new PrismaClient();

async function main() {
  const email = process.env.SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_PASSWORD;
  if (!email || !password) {
    console.log("[seed] SEED_EMAIL / SEED_PASSWORD not set: nothing to do.");
    return;
  }
  if (await db.user.findUnique({ where: { email } })) {
    console.log(`[seed] ${email} already exists.`);
    return;
  }
  const user = await db.user.create({ data: { email, name: "Demo owner", passwordHash: hashPassword(password) } });
  const ws = await db.workspace.create({
    data: { name: "Demo workspace", slug: "demo-workspace", incidentPrefix: "DEMO", memberships: { create: { userId: user.id, role: "owner" } } },
  });
  const web = await db.monitor.create({
    data: { workspaceId: ws.id, name: "Website", type: "http", target: "https://example.com", intervalSec: 60, status: "pending" },
  });
  const tcp = await db.monitor.create({
    data: { workspaceId: ws.id, name: "Database", type: "tcp", target: "example.com:443", intervalSec: 300, status: "pending" },
  });
  await db.statusPage.create({
    data: {
      workspaceId: ws.id,
      slug: "demo",
      name: "Demo status",
      description: "Sample status page created by the seed script.",
      components: { create: [{ monitorId: web.id, order: 0 }, { monitorId: tcp.id, order: 1 }] },
    },
  });
  console.log(`[seed] created ${email} with workspace "Demo workspace" and status page /s/demo`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
