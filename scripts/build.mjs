#!/usr/bin/env node
// Build pipeline used by `npm run build` locally and on Vercel:
//   1. pick the Prisma provider from DATABASE_URL (SQLite vs PostgreSQL/Neon)
//   2. generate the Prisma client
//   3. optionally sync the schema to the database (DB_PUSH_ON_BUILD=true), handy for Neon + Vercel
//   4. next build
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit", env: process.env });

run("node scripts/prepare-db.mjs");
run("npx prisma generate");
if (process.env.DB_PUSH_ON_BUILD === "true") {
  console.log("[build] DB_PUSH_ON_BUILD=true → syncing schema with prisma db push");
  run("npx prisma db push --skip-generate");
}
run("npx next build");
