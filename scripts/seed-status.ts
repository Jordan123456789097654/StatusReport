// Creates StatusReport's own monitors and public status page (shown at /status).
// Usage: STATUS_OWNER_EMAIL=you@example.com npm run db:seed-status
// The email must belong to an existing account that is an owner/admin of a workspace. Safe to re-run.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const email = process.env.STATUS_OWNER_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error("Set STATUS_OWNER_EMAIL to the email of an existing account (register on the site first).");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account for ${email}. Register at the site first.`);
  const membership = await db.membership.findFirst({ where: { userId: user.id, role: { in: ["owner", "admin"] } }, orderBy: { createdAt: "asc" } });
  if (!membership) throw new Error(`${email} is not an owner/admin of any workspace.`);
  const workspaceId = membership.workspaceId;

  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const targets = [
    { name: "Website", target: `${base}/` },
    { name: "Dashboard login", target: `${base}/login` },
    { name: "API", target: `${base}/api/v1/openapi.json` },
  ];

  const monitors = [];
  for (const t of targets) {
    const existing = await db.monitor.findFirst({ where: { workspaceId, name: t.name } });
    monitors.push(
      existing ??
        (await db.monitor.create({ data: { workspaceId, name: t.name, type: "http", target: t.target, method: "GET", intervalSec: 60, confirmations: 2, status: "pending" } })),
    );
  }

  const slug = process.env.PLATFORM_STATUS_SLUG || "statusreport";
  const page =
    (await db.statusPage.findUnique({ where: { slug } })) ??
    (await db.statusPage.create({
      data: { workspaceId, slug, name: "StatusReport", description: "Live status of the StatusReport platform." },
    }));
  if (page.workspaceId !== workspaceId) throw new Error(`Slug "${slug}" is already used by another workspace.`);

  for (const [i, m] of monitors.entries()) {
    await db.statusPageComponent.upsert({
      where: { statusPageId_monitorId: { statusPageId: page.id, monitorId: m.id } },
      create: { statusPageId: page.id, monitorId: m.id, order: i },
      update: {},
    });
  }
  console.log(`[seed-status] ready: ${monitors.length} monitors, status page at ${base}/status`);
}

main()
  .catch((e) => {
    console.error(`[seed-status] ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
